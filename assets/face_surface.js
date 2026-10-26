// Dense Blender surface bakes. Geometry, facial deltas and skin weights are unchanged.
export class FaceSurface {
  constructor(T) {
    this.T=T;this.maps={};this.enabled=true;
    this.u={uSurfaceDetail:{value:1},uFaceNeutral:{value:null},uFaceBlush:{value:null},uBlushAmount:{value:0}};
    for(const k of ['L','R','M'])for(const [suffix,value] of [['Low',null],['High',null],['Mix',0],['Active',0]])this.u['uFace'+k+suffix]={value};
  }
  async load(texture) {
    const names=['neutral','blush100',...['blinkL','blinkR','mouth'].flatMap(k=>[25,50,75,100].map(v=>k+v))];
    await Promise.all(names.map(async name=>this.maps[name]=await texture('assets/face_surface_v05/'+name+'.png')));
    this.u.uFaceNeutral.value=this.maps.neutral;this.u.uFaceBlush.value=this.maps.blush100;this.setState({});
  }
  setState(f) {
    for(const [k,prefix,prop] of [['L','blinkL','Face_Blink_L'],['R','blinkR','Face_Blink_R'],['M','mouth','Face_Mouth_Open']]){
      const value=Math.max(0,Math.min(1,f[prop]||0)),v=value*4,lo=Math.floor(v),hi=Math.min(4,lo+1);
      this.u['uFace'+k+'Low'].value=this.maps[lo?prefix+(lo*25):'neutral'];
      this.u['uFace'+k+'High'].value=this.maps[hi?prefix+(hi*25):'neutral'];
      this.u['uFace'+k+'Mix'].value=v-lo;this.u['uFace'+k+'Active'].value=value>0?1:0;
    }
    this.u.uBlushAmount.value=Math.max(0,Math.min(1,f.Face_Blush||0));
  }
  setEnabled(value){this.enabled=value;this.u.uSurfaceDetail.value=value?1:0;}
  attach(m){
    const before=m.onBeforeCompile.bind(m),key=m.customProgramCacheKey();
    m.onBeforeCompile=shader=>{
      before(shader);Object.assign(shader.uniforms,this.u);
      shader.vertexShader='varying vec2 vSurfaceUV;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvSurfaceUV=uv;');
      shader.fragmentShader=`varying vec2 vSurfaceUV;
uniform float uSurfaceDetail,uBlushAmount;
uniform sampler2D uFaceNeutral,uFaceBlush;
${['L','R','M'].map(k=>`uniform sampler2D uFace${k}Low,uFace${k}High; uniform float uFace${k}Mix,uFace${k}Active;`).join('\n')}
vec3 denseFace(){
  vec3 neutral=texture2D(uFaceNeutral,vSurfaceUV).rgb; vec3 result=neutral;
  ${['L','R','M'].map(k=>`if(uFace${k}Active>.5)result+=mix(texture2D(uFace${k}Low,vSurfaceUV).rgb,texture2D(uFace${k}High,vSurfaceUV).rgb,uFace${k}Mix)-neutral;`).join('\n')}
  if(uBlushAmount>.0001)result+=(texture2D(uFaceBlush,vSurfaceUV).rgb-neutral)*uBlushAmount;
  return clamp(result,0.0,1.0);
}
`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('diffuseColor.rgb=vFaceFull;','diffuseColor.rgb=uSurfaceDetail>.5?denseFace():vFaceFull;');
    };
    m.customProgramCacheKey=()=>key+'-dense-surface-v05';m.needsUpdate=true;
  }
}
