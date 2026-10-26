// Reversible material overlays. Authored images and facial morph data stay unchanged.
export class LookDevelopment {
  constructor(THREE) {
    this.T=THREE;
    this.uniforms={uFinish:{value:1},uBlood:{value:1},uMakeup:{value:1.4},uEvenTone:{value:1},uHairColorOnly:{value:0}};
    this.materials=[];
  }
  attachGeometry(mesh,headMatrix,bones) {
    const T=this.T, geometry=mesh.geometry, p=geometry.attributes.position;
    const face=!!mesh.userData.arrays?.colorNeutral;
    const skin=face||mesh.userData.part?.material==='Witch_Skin_Body';
    if(!skin)return;
    const inverse=headMatrix.clone().invert(), masks=new Float32Array(p.count*4);
    const joints=bones.filter(b=>/ForeArm$|Hand$|Leg$/.test(b.name)).map(b=>b.getWorldPosition(new T.Vector3()));
    const q=new T.Vector3(),world=new T.Vector3();
    const gaussian=(x,y,cx,cy,rx,ry)=>Math.exp(-.5*((x-cx)**2/rx**2+(y-cy)**2/ry**2));
    const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
    for(let i=0;i<p.count;i++){
      world.fromBufferAttribute(p,i);q.copy(world).applyMatrix4(inverse);
      if(face){
        const gate=smooth(.045,.075,q.z), a=mesh.userData.arrays;
        const eye=Math.max(a.faceMasks[i*3],a.faceMasks[i*3+1]);
        const cheek=(gaussian(q.x,q.y,.058,.039,.025,.014)+gaussian(q.x,q.y,-.060,.044,.025,.014))*gate*(1-smooth(.05,.45,eye));
        // A smooth lip-surface mask avoids amplifying the narrow seam's speckled colors.
        // Pixel pigment/brightness gating in the shader protects teeth and oral cavity.
        const lip=gaussian(q.x,q.y,-.004,.015,.025,.006)*gate*smooth(.093,.102,q.z);
        const shadow=(gaussian(q.x,q.y,.054,.084,.024,.009)+gaussian(q.x,q.y,-.058,.090,.024,.009))*gate;
        const nose=gaussian(q.x,q.y,-.002,.040,.010,.009)*gate;
        const ears=smooth(.073,.096,Math.abs(q.x))*(1-smooth(.07,.10,q.y))*smooth(-.02,.015,q.y);
        masks.set([Math.min(1,cheek),Math.min(1,lip),Math.min(1,shadow),Math.min(1,nose*.45+ears*.5)],i*4);
      }else{
        let vascular=0;for(const joint of joints)vascular=Math.max(vascular,Math.exp(-world.distanceToSquared(joint)/(.036*.036*2)));
        masks[i*4+3]=vascular*.5;
      }
    }
    geometry.setAttribute('careMask',new T.BufferAttribute(masks,4));
  }
  attachMaterial(m,{skin=false,face=false,hair=false}={}) {
    if(!skin&&!hair)return;
    const previous=m.onBeforeCompile.bind(m), cache=m.customProgramCacheKey.bind(m);
    const oldCache=cache();
    const original={env:m.envMapIntensity,spec:m.specularIntensity};
    this.materials.push({m,hair,original});
    m.onBeforeCompile=shader=>{
      previous(shader);Object.assign(shader.uniforms,this.uniforms);
      shader.fragmentShader='uniform float uFinish;uniform float uBlood;uniform float uMakeup;uniform float uEvenTone;uniform float uHairColorOnly;\n'+shader.fragmentShader;
      if(skin){
        shader.vertexShader='attribute vec4 careMask;varying vec4 vCareMask;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCareMask=careMask;');
        shader.fragmentShader='varying vec4 vCareMask;\n'+shader.fragmentShader;
        const eyeGuard=face?'1.0-clamp(max(vFaceMasks.x*(1.0-uBlinkL),vFaceMasks.y*(1.0-uBlinkR)),0.0,1.0)':'1.0';
        const anchor=face?'diffuseColor.rgb=vFaceFull;':'#include <color_fragment>';
        shader.fragmentShader=shader.fragmentShader.replace(anchor,anchor+`
float pigmentGate=smoothstep(.035,.15,diffuseColor.r-diffuseColor.g)*smoothstep(.16,.40,diffuseColor.r);
float skinGate=pigmentGate*(${eyeGuard});
vec3 warmTone=diffuseColor.rgb*vec3(1.01,.865,.86);
diffuseColor.rgb=mix(diffuseColor.rgb,warmTone,uFinish*uBlood*skinGate);
float rosy=clamp(vCareMask.x*.28*uMakeup+vCareMask.w*.22*uBlood,0.0,.6)*skinGate;
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.04,.61,.68),uFinish*rosy);
float shadowAmount=vCareMask.z*.26*uMakeup*skinGate;
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.77,.48,.57),uFinish*shadowAmount);
float lipAmount=clamp(vCareMask.y*.70*uMakeup*pigmentGate,0.0,.95);
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.98,.57,.72),uFinish*lipAmount);
`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,clamp(.66-vCareMask.y*.14,.5,.72),uFinish*skinGate);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,0.0,uFinish);');
      }
      if(hair){
        shader.vertexShader='varying vec3 vHairRest;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvHairRest=position;');
        shader.fragmentShader='varying vec3 vHairRest;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
float hairLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
vec3 softPigment=diffuseColor.rgb/(1.0+max(0.0,hairLuma-.09)*2.0);
// Reduce painted patches while letting actual lighting describe the lock volumes.
float gentleVariation=clamp(pow(max(hairLuma,.001)/.058,.18),.93,1.08);
vec3 evenPigment=vec3(.016,.068,.078)*gentleVariation;
softPigment=mix(softPigment,evenPigment,uEvenTone);
diffuseColor.rgb=mix(diffuseColor.rgb,softPigment,uFinish);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
float strandGrain=.5+.5*sin(vHairRest.x*2300.0+vHairRest.y*110.0+vHairRest.z*290.0);
roughnessFactor=mix(roughnessFactor,.82+.045*strandGrain,uFinish);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,0.0,uFinish);');
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','if(uHairColorOnly>.5)outgoingLight=diffuseColor.rgb;\n#include <opaque_fragment>');
      }
    };
    m.customProgramCacheKey=()=>oldCache+'-care-v04-'+[skin,face,hair].join('-');
    m.needsUpdate=true;
  }
  set({enabled=true,blood=1,makeup=1.4,tone=1,pigmentOnly=false}={}) {
    this.uniforms.uFinish.value=enabled?1:0;
    this.uniforms.uBlood.value=blood;this.uniforms.uMakeup.value=makeup;
    this.uniforms.uEvenTone.value=tone;this.uniforms.uHairColorOnly.value=pigmentOnly?1:0;
    for(const {m,hair,original} of this.materials){
      m.envMapIntensity=enabled&&hair?.45:original.env;
      if(original.spec!==undefined)m.specularIntensity=enabled?(hair?.24:.25):original.spec;
    }
  }
}
