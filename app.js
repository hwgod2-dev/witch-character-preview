import {installUpperChoices} from './assets/approved_upper_v07/upper_choices.js?v=blog-embed-v01';
let upperChoices=null;
import {installPendantReplay} from './assets/pendant_playback_v06.js';
let pendantReplay=null;
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { BraidPhysics } from './physics.js';
import { LiveMotion, ShortHairPhysics } from './live_motion.js';
import { LookDevelopment } from './assets/lookdev_v04.js';
import { FaceSurface } from './assets/face_surface.js';
import { StudioLighting } from './assets/studio_lighting.js';

const $=id=>document.getElementById(id), canvas=$('canvas');
const embedded=document.documentElement.dataset.embed==='true';
let liteConfig=null, embedVisible=true;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(35,1,.08,12);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.setPixelRatio(embedded?Math.min(devicePixelRatio,1.25):Math.min(Math.max(devicePixelRatio,1.5),2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.08;
if(embedded){controls.enableZoom=false;controls.enablePan=false;canvas.style.touchAction='pan-y';}
controls.minDistance=.35;controls.maxDistance=7;controls.maxPolarAngle=Math.PI*.88;controls.autoRotateSpeed=.65;
const root=new THREE.Group();scene.add(root);
scene.add(new THREE.HemisphereLight(0xd8e5e0,0x423a31,.8));
function light(color,intensity,position){const l=new THREE.DirectionalLight(color,intensity);l.position.set(...position);scene.add(l);return l;}
const key=light(0xffefd8,1.6,[2,3,3]);key.castShadow=true;
key.shadow.mapSize.set(embedded?1024:2048,embedded?1024:2048);key.shadow.camera.left=-1.5;key.shadow.camera.right=1.5;key.shadow.camera.top=2.2;key.shadow.camera.bottom=-1.5;key.shadow.camera.near=.1;key.shadow.camera.far=12;key.shadow.bias=-.00008;key.shadow.normalBias=.003;
light(0xc4e5ed,.6,[-3,2,1]);light(0xe6cda9,1.4,[-1,3,-3]);
const room=new THREE.Scene();room.background=new THREE.Color(.2,.22,.22);
for(const [position,size,intensity] of [[[3,3,2],[4,5],2],[[-4,2,1],[3,4],1],[[0,4,-3],[4,3],1.5]]){
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(...size),new THREE.MeshBasicMaterial({color:new THREE.Color(intensity,intensity,intensity),side:THREE.DoubleSide}));
  panel.position.set(...position);panel.lookAt(0,1,0);room.add(panel);
}
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(room,.08).texture;scene.environmentIntensity=.5;pmrem.dispose();
const studioLighting=new StudioLighting(scene,renderer);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.16}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);

const state={mode:'orbit',paused:false,ready:false,time:0,face:{},desired:{},pointer:new THREE.Vector2(),look:new THREE.Vector2(),pointerInside:false,dragging:false,nextBlink:3.4,blinkStart:-100,lastColorKey:''};
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduced)for(const id of ['autoBlink','breathe','follow'])$(id).checked=false;
let bones=[], meshes=[], faceMeshes=[], skeleton, braid, manifest, motion, shortHair, napeCover;
const rest=[], materials={}, textures=new Map();
const lookdev=new LookDevelopment(THREE);
const faceSurface=new FaceSurface(THREE);
function typed(buffer,spec){const types={float32:Float32Array,uint16:Uint16Array,uint32:Uint32Array,int32:Int32Array};return new types[spec.type](buffer,spec.offset,spec.count);}
async function texture(url,color=true){
  const key=url+color;if(textures.has(key))return textures.get(key);
  url=liteConfig?.textures[url]||url;
  const promise=new THREE.TextureLoader().loadAsync(url).then(t=>{t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;});textures.set(key,promise);return promise;
}
async function material(name,description){
  const isHair=['Witch_Hair','Witch_Braid'].includes(name),isSkin=description.face||name==='Witch_Skin_Body';
  const Constructor=isSkin||isHair?THREE.MeshPhysicalMaterial:THREE.MeshStandardMaterial;
  const m=new Constructor({color:new THREE.Color(...description.color),roughness:description.roughness,metalness:description.metalness,side:THREE.DoubleSide});
  if(description.map)m.map=await texture(description.map);
  if(description.orm){const orm=await texture(description.orm,false);m.roughnessMap=orm;m.metalnessMap=orm;}
  if(name==='Face_Brow_Patch_v03'){
    m.transparent=true;m.depthWrite=false;m.alphaTest=.025;
    m.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float browMask; varying float vBrowMask;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBrowMask=browMask;');
      shader.fragmentShader='varying float vBrowMask;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
float browT=clamp((diffuseColor.r-.20)/.20,0.0,1.0);
diffuseColor.a*=vBrowMask*(1.0-browT*browT*browT*(browT*(browT*6.0-15.0)+10.0));`);
    };m.customProgramCacheKey=()=> 'original-brow-mask-v1';
  }
  if(description.face){
    m.vertexColors=true;m.roughness=.82;m.specularIntensity=.05;m.metalness=0;m.metalnessMap=null;m.roughnessMap=null;m.side=THREE.FrontSide;
    m.userData.faceUniforms={uBlinkL:{value:0},uBlinkR:{value:0},uMouth:{value:0}};
    m.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,m.userData.faceUniforms);
      shader.vertexShader='attribute vec3 faceFull; attribute vec3 faceMasks; varying vec3 vFaceFull; varying vec3 vFaceMasks;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvFaceFull=faceFull;vFaceMasks=faceMasks;');
      shader.fragmentShader='varying vec3 vFaceFull;varying vec3 vFaceMasks;uniform float uBlinkL;uniform float uBlinkR;uniform float uMouth;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','diffuseColor.rgb=vFaceFull;');
    };
    m.customProgramCacheKey=()=> 'witch-face-color-v1';
  }
  lookdev.attachMaterial(m,{skin:isSkin,face:!!description.face,hair:isHair});
  if(description.face)faceSurface.attach(m);
  materials[name]=m;
}
async function load(){
  if(embedded){const configResponse=await fetch('assets/embed_lite/config.json');if(!configResponse.ok)throw new Error('본문용 화면 설정을 불러올 수 없습니다.');liteConfig=await configResponse.json();}
  const response=await fetch('assets/approved_v06/character.json');if(!response.ok)throw new Error('모델 목록을 불러올 수 없습니다.');manifest=await response.json();
  const buffer=await loadAssetBuffer('assets/approved_v06/character.bin',true);
  if(buffer.byteLength!==manifest.bytes)throw new Error('모델 파일이 완전히 내려받아지지 않았습니다. 새로고침해주세요.');
  bones=manifest.bones.map(data=>{const b=new THREE.Bone();b.name=data.name;new THREE.Matrix4().fromArray(data.matrix).decompose(b.position,b.quaternion,b.scale);b.userData.tail=data.tail;return b;});
  manifest.bones.forEach((data,i)=>{(data.parent<0?root:bones[data.parent]).add(bones[i]);});root.updateMatrixWorld(true);
  bones.forEach(b=>rest.push({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone(),world:b.getWorldQuaternion(new THREE.Quaternion())}));
  skeleton=new THREE.Skeleton(bones);skeleton.calculateInverses();
  await Promise.all([faceSurface.load(texture),...Object.entries(manifest.materials).map(([name,m])=>material(name,m))]);
  for(const part of manifest.parts){
    const geometry=new THREE.BufferGeometry(), a={};for(const [k,spec]of Object.entries(part.arrays))a[k]=typed(buffer,spec);
    for(const [key,size]of [['position',3],['normal',3],['uv',2],['skinIndex',4],['skinWeight',4]])geometry.setAttribute(key,new THREE.BufferAttribute(a[key],size));
    geometry.setIndex(new THREE.BufferAttribute(a.index,1));
    if(a.browMask)geometry.setAttribute('browMask',new THREE.BufferAttribute(a.browMask,1));
    if(part.morphs.length){geometry.morphTargetsRelative=true;geometry.morphAttributes.position=part.morphs.map(v=>new THREE.BufferAttribute(a[v.key],3));geometry.morphAttributes.normal=part.morphs.map(v=>new THREE.BufferAttribute(a['normal_'+v.key],3));}
    if(a.colorNeutral){
      const correction=new Float32Array(a.colorNeutral.length), full=new Float32Array(a.colorNeutral);
      for(let i=0;i<correction.length;i++)correction[i]=full[i]-a.baseSample[i];
      geometry.setAttribute('color',new THREE.BufferAttribute(correction,3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('faceFull',new THREE.BufferAttribute(full,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('faceMasks',new THREE.BufferAttribute(a.faceMasks,3));
    }
    const mesh=part.skinned?new THREE.SkinnedMesh(geometry,materials[part.material]):new THREE.Mesh(geometry,materials[part.material]);
    mesh.name=part.name;mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=!a.colorNeutral;mesh.userData={part,arrays:a};
    lookdev.attachGeometry(mesh,bones.find(b=>b.name==='mixamorig:Head').matrixWorld,bones);
    if(part.name.startsWith('Face_Brow'))mesh.castShadow=false;
    root.add(mesh);if(part.skinned)mesh.bind(skeleton,new THREE.Matrix4());meshes.push(mesh);if(a.colorNeutral)faceMeshes.push(mesh);
  }
  root.updateMatrixWorld(true);
  const cover=JSON.parse(new TextDecoder().decode(await loadAssetBuffer('assets/nape_cover_v02.json')));
  const cg=new THREE.BufferGeometry(),countCover=cover.position.length/3;
  for(const [name,size]of [['position',3],['normal',3],['color',3]])cg.setAttribute(name,new THREE.Float32BufferAttribute(cover[name],size));
  cg.setIndex(cover.index);
  const ci=new Uint16Array(countCover*4),cw=new Float32Array(countCover*4);for(let i=0;i<countCover;i++){ci[i*4]=cover.bone;cw[i*4]=1;}
  cg.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ci,4));cg.setAttribute('skinWeight',new THREE.Float32BufferAttribute(cw,4));
  napeCover=new THREE.SkinnedMesh(cg,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.53,metalness:.03,side:THREE.DoubleSide}));
  napeCover.name=cover.name;napeCover.frustumCulled=false;napeCover.castShadow=true;napeCover.receiveShadow=true;
  lookdev.attachMaterial(napeCover.material,{hair:true});
  updateFinish();
  root.add(napeCover);napeCover.bind(skeleton,new THREE.Matrix4());
  const bbox=new THREE.Box3().setFromObject(root);floor.position.y=bbox.min.y-.002;
  const braidBones=bones.filter(b=>/^Braid_\d+$/.test(b.name)).sort((a,b)=>a.name.localeCompare(b.name));
  braid=new BraidPhysics(braidBones,bones,manifest.colliders);
  motion=new LiveMotion(bones);shortHair=new ShortHairPhysics(bones,manifest.colliders);
  for(let i=0;i<240;i++){resetBones();root.updateMatrixWorld(true);braid.update(1/120);}
  state.face={...manifest.face_defaults};state.desired={...state.face};state.ready=true;
  setView('full');applyFace(true);$('loading').classList.add('hidden');$('status').textContent='드래그 · 회전 / 휠 · 확대';
  window.characterStudio={state,manifest,scene,camera,meshes,bones,braid,shortHair,motion,renderer,setView,setExpression,setMode,loadAssetBuffer,embedded};upperChoices=await installUpperChoices(window.characterStudio);
 pendantReplay=await installPendantReplay(window.characterStudio);
 if(embedded){$('lookAround').checked=!reduced;setMode('live');setView('portrait');if(reduced){state.paused=true;updateEmbedPause();}document.documentElement.dataset.ready='true';}
}
async function loadAssetBuffer(url,progress=false){
  const packed=liteConfig?.binaries[url],usePacked=packed&&typeof DecompressionStream==='function';
  const response=await fetch(usePacked?packed.url:url);
  if(!response.ok)throw new Error('캐릭터 데이터를 불러올 수 없습니다.');
  let body=response.body;
  if(progress){let received=0;const total=usePacked?packed.bytes:manifest.bytes;body=body.pipeThrough(new TransformStream({transform(chunk,controller){received+=chunk.byteLength;$('loadingText').textContent=`캐릭터 불러오는 중 · ${Math.min(100,Math.round(received/total*100))}%`;controller.enqueue(chunk);}}));}
  if(usePacked)body=body.pipeThrough(new DecompressionStream('gzip'));
  const buffer=await new Response(body).arrayBuffer();
  if(usePacked&&buffer.byteLength!==packed.decodedBytes)throw new Error('캐릭터 데이터 크기를 확인할 수 없습니다.');
  return buffer;
}
function resetBones(){bones.forEach((b,i)=>{b.position.copy(rest[i].p);b.quaternion.copy(rest[i].q);b.scale.copy(rest[i].s);});}
function rotateBone(name,yaw,pitch,roll=0){const i=bones.findIndex(b=>b.name===name);if(i<0)return;
  const b=bones[i], parentQ=b.parent.getWorldQuaternion(new THREE.Quaternion());
  const delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,roll,'YXZ'));
  const parentDelta=parentQ.clone().invert().multiply(delta).multiply(parentQ);b.quaternion.premultiply(parentDelta);b.updateMatrixWorld(true);
}
const expressions={neutral:{Face_Smile:.15},happy:{Face_Smile:.85,Face_Mouth_Open:.2,Face_Brow_Up:.15},surprise:{Face_Mouth_Open:.85,Face_Brow_Up:.75},sad:{Face_Frown:.65,Face_Brow_Tilt:-.7},angry:{Face_Frown:.4,Face_Brow_Tilt:.8},shy:{Face_Smile:.45,Face_Blush:.65,Face_Blink_L:.15,Face_Blink_R:.15},wink:{Face_Smile:.65,Face_Blink_L:1},rest:{Face_Blink_L:1,Face_Blink_R:1,Face_Smile:.2}};
function setExpression(name){
  for(const k of Object.keys(state.desired))state.desired[k]=0;
  Object.assign(state.desired,expressions[name]);
  document.querySelectorAll('[data-expression]').forEach(b=>{b.classList.toggle('active',b.dataset.expression===name);b.setAttribute('aria-pressed',String(b.dataset.expression===name));});
  $('mouth').value=Math.round((state.desired.Face_Mouth_Open||0)*100);$('mouthValue').value=$('mouth').value+'%';
  $('blink').value=Math.round(Math.min(state.desired.Face_Blink_L||0,state.desired.Face_Blink_R||0)*100);$('blinkValue').value=$('blink').value+'%';
}
function setMode(mode){state.mode=mode;state.pointer.set(0,0);state.look.set(0,0);state.pointerInside=false;controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');
  state.nextBlink=state.time+2.2;state.blinkStart=-100;
  $('orbitMode').classList.toggle('active',mode==='orbit');$('liveMode').classList.toggle('active',mode==='live');$('orbitMode').setAttribute('aria-pressed',String(mode==='orbit'));$('liveMode').setAttribute('aria-pressed',String(mode==='live'));
  document.querySelector('.stage').classList.toggle('live',mode==='live');$('modeNote').textContent=mode==='live'?'고개와 몸이 함께 반응하고, 숨을 쉽니다.':'드래그해 돌려보고, 휠로 가까이 보세요.';
  $('stageLabel').textContent=mode==='live'?'몸 반응 · 호흡 · 헤어 물리':'P5 · 바위와 경사 지형';setView(mode==='live'?(embedded?'portrait':'face'):'full');
  if(embedded){$('embedMode').textContent=mode==='live'?'360도 감상':'살아있는 캐릭터';$('embedMode').setAttribute('aria-pressed',String(mode==='live'));}
}
function setView(view){
  state.view=view;
  const target=view==='portrait'?new THREE.Vector3(.01,1.35,-.03):['face','nape','beauty'].includes(view)?new THREE.Vector3(.01,1.49,-.03):new THREE.Vector3(0,1.0,0);
  const pos={portrait:[.04,1.40,Math.max(1.85,1.65/camera.aspect)],full:[1.5,1.6,3.35],face:[.03,1.47,1.2],beauty:[.03,1.50,.70],nape:[.01,1.53,-1.06],front:[0,1.45,3.5],back:[0,1.55,-3.5],side:[3.5,1.5,0]}[view]||[0,1.45,3.5];
  camera.position.set(...pos);controls.target.copy(target);controls.update();
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
}
function applyFace(force=false,blinkPulse=0){
  const f={...state.face};f.Face_Blink_L=Math.max(f.Face_Blink_L||0,blinkPulse);f.Face_Blink_R=Math.max(f.Face_Blink_R||0,blinkPulse);
  faceSurface.setState(f);
  for(const mesh of meshes){const {part}=mesh.userData;if(!part.morphs.length)continue;
    part.morphs.forEach((target,i)=>mesh.morphTargetInfluences[i]=Math.max(0,(f[target.name]||0)*Math.sign(target.value)));
  }
  const key=[f.Face_Blink_L,f.Face_Blink_R,f.Face_Mouth_Open,f.Face_Blush].map(v=>(v||0).toFixed(3)).join('/');if(!force&&key===state.lastColorKey)return;state.lastColorKey=key;
  // The embed uses the dense UV surface shader, so its unused vertex colors need no per-frame upload.
  if(embedded&&faceSurface.enabled){for(const mesh of faceMeshes){const u=mesh.material.userData.faceUniforms;u.uBlinkL.value=f.Face_Blink_L;u.uBlinkR.value=f.Face_Blink_R;u.uMouth.value=f.Face_Mouth_Open||0;}return;}
  for(const mesh of faceMeshes){
    const {part,arrays:a}=mesh.userData, full=mesh.geometry.attributes.faceFull.array, correction=mesh.geometry.attributes.color.array;
    full.set(a.colorNeutral);
    for(const name of ['Face_Blink_L','Face_Blink_R','Face_Mouth_Open','Face_Blush']){
      const value=Math.max(0,Math.min(1,f[name]||0));if(value<.0001)continue;
      const states=part.colors.filter(s=>s.name===name).sort((a,b)=>a.value-b.value);if(!states.length)continue;
      let before={value:0,array:a.colorNeutral},after={value:1,array:a.colorNeutral};
      for(const s of states){if(s.value<=value)before={value:s.value,array:a[s.key]};if(s.value>=value){after={value:s.value,array:a[s.key]};break;}}
      const weight=after.value===before.value?0:(value-before.value)/(after.value-before.value);
      for(let i=0;i<full.length;i++)full[i]+=before.array[i]*(1-weight)+after.array[i]*weight-a.colorNeutral[i];
    }
    for(let i=0;i<full.length;i++)correction[i]=full[i]-a.baseSample[i];
    mesh.geometry.attributes.color.needsUpdate=true;mesh.geometry.attributes.faceFull.needsUpdate=true;
    const u=mesh.material.userData.faceUniforms;u.uBlinkL.value=f.Face_Blink_L;u.uBlinkR.value=f.Face_Blink_R;u.uMouth.value=f.Face_Mouth_Open||0;
  }
}

document.querySelectorAll('[data-expression]').forEach(b=>b.addEventListener('click',()=>setExpression(b.dataset.expression)));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('orbitMode').onclick=()=>setMode('orbit');$('liveMode').onclick=()=>setMode('live');$('resetFace').onclick=()=>setExpression('neutral');
$('reset').onclick=()=>{setView(state.mode==='live'?'face':'full');state.pointer.set(0,0);state.look.set(0,0);};
$('rotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('rotate').setAttribute('aria-pressed',String(controls.autoRotate));};
$('pause').onclick=()=>{state.paused=!state.paused;$('pause').setAttribute('aria-pressed',String(state.paused));$('pause').textContent=state.paused?'▶ 움직임 재생':'Ⅱ 움직임 멈춤';if(embedded)updateEmbedPause();};
$('hat').onchange=()=>meshes.filter(m=>m.name==='hat').forEach(m=>m.visible=$('hat').checked);
$('mouth').oninput=()=>{state.desired.Face_Mouth_Open=+$('mouth').value/100;$('mouthValue').value=$('mouth').value+'%';};
$('blink').oninput=()=>{state.desired.Face_Blink_L=state.desired.Face_Blink_R=+$('blink').value/100;$('blinkValue').value=$('blink').value+'%';};
$('light').oninput=()=>{studioLighting.brightness(+$('light').value/100);$('lightValue').value=$('light').value+'%';};
for(const id of ['qualityPrevious','qualityStudio'])$(id).onclick=()=>{
  const clean=id==='qualityStudio';faceSurface.setEnabled(clean);studioLighting.set(clean);studioLighting.brightness(+$('light').value/100);
  for(const button of ['qualityPrevious','qualityStudio']){$(button).setAttribute('aria-pressed',String(button===id));$(button).classList.toggle('active',button===id);}
};
$('braid').onchange=()=>{if(braid&&$('braid').checked){resetBones();root.updateMatrixWorld(true);braid.reset();}};
$('shortHair').onchange=()=>{if(shortHair&&$('shortHair').checked)shortHair.reset();};
$('napeCover').onchange=()=>{if(napeCover)napeCover.visible=$('napeCover').checked;};
$('breathStrength').oninput=()=>{$('breathValue').value=$('breathStrength').value+'%';};
$('lookAround').onchange=()=>{if($('lookAround').checked)setMode('live');};
function updateFinish(){
  const current=$('finishNew').getAttribute('aria-pressed')==='true';
  lookdev.set({enabled:true,blood:+$('skinBlood').value/100,makeup:current?+$('makeupStrength').value/100:1,tone:current?1:0,pigmentOnly:$('hairColorOnly').checked});
}
let proposedMakeup=+$('makeupStrength').value;
for(const id of ['finishOriginal','finishNew'])$(id).onclick=()=>{
  if($('finishNew').getAttribute('aria-pressed')==='true')proposedMakeup=+$('makeupStrength').value;
  for(const button of ['finishOriginal','finishNew']){$(button).setAttribute('aria-pressed',String(button===id));$(button).classList.toggle('active',button===id);}
  $('makeupStrength').value=id==='finishNew'?proposedMakeup:100;
  $('makeupStrength').disabled=id!=='finishNew';
  $('makeupValue').value=$('makeupStrength').value+'%';
  updateFinish();
};
for(const [id,out] of [['skinBlood','skinBloodValue'],['makeupStrength','makeupValue'],['hairBreeze','hairBreezeValue']])$(id).oninput=()=>{$(out).value=$(id).value+'%';updateFinish();};
$('hairColorOnly').onchange=updateFinish;
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();state.pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);state.pointerInside=true;});
canvas.addEventListener('pointerleave',()=>{state.pointerInside=false;state.pointer.set(0,0);});
controls.addEventListener('start',()=>state.dragging=true);controls.addEventListener('end',()=>state.dragging=false);
canvas.addEventListener('keydown',e=>{
  if(e.key==='Home'){setView(state.mode==='live'?'face':'full');e.preventDefault();}
  if(['ArrowLeft','ArrowRight'].includes(e.key)){const v=camera.position.clone().sub(controls.target);v.applyAxisAngle(new THREE.Vector3(0,1,0),e.key==='ArrowLeft'?.14:-.14);camera.position.copy(controls.target).add(v);controls.update();e.preventDefault();}
  if(e.key==='+'||e.key==='-'){camera.position.sub(controls.target).multiplyScalar(e.key==='+'?.9:1.1).add(controls.target);controls.update();e.preventDefault();}
});
function updateEmbedPause(){const button=$('embedPause');if(!button)return;button.textContent=state.paused?'움직임 재생':'움직임 멈춤';button.setAttribute('aria-pressed',String(state.paused));}
if(embedded){
  $('embedMode').onclick=()=>setMode(state.mode==='live'?'orbit':'live');
  $('embedPause').onclick=()=>$('pause').click();
  new IntersectionObserver(entries=>{embedVisible=entries[0].isIntersecting;previous=performance.now();if(braid)braid.accumulator=0;if(shortHair)shortHair.accumulator=0;}).observe(canvas);
}
const resize=()=>{const box=canvas.getBoundingClientRect();renderer.setSize(box.width,box.height,false);camera.aspect=box.width/box.height;camera.updateProjectionMatrix();if(embedded&&state.ready)setView(state.view||'portrait');};
new ResizeObserver(resize).observe(canvas.parentElement);resize();
let previous=performance.now(),frames=0,fpsStart=previous,renderFailures=[];
window.addEventListener('error',event=>renderFailures.push(event.message));
renderer.debug.onShaderError=(gl,program,vs,fs)=>{const message=gl.getShaderInfoLog(vs)+'\n'+gl.getShaderInfoLog(fs);renderFailures.push(message);console.error(message);$('loadingText').textContent='화면 처리 중 오류가 발생했습니다. 브라우저 WebGL 설정을 확인해주세요.';};
document.addEventListener('visibilitychange',()=>{previous=performance.now();if(braid)braid.accumulator=0;if(shortHair)shortHair.accumulator=0;});
function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden||(embedded&&!embedVisible)){previous=now;return;}
  // Tolerate RAF timestamp jitter so a 30 Hz callback is not needlessly cut to 15 Hz.
  if(embedded&&now-previous<1000/30-1)return;
  const dt=Math.min((now-previous)/1000,embedded ? .065 : .04);previous=now;
  if(state.ready){
    if(!state.paused)state.time+=dt;
    const live=state.mode==='live'&&!state.paused;
    for(const k of Object.keys(state.desired)){const target=state.desired[k]||0;state.face[k]+=(target-state.face[k])*(1-Math.exp(-12*dt));if(Math.abs(target-state.face[k])<.0005)state.face[k]=target;}
    let blinkPulse=0;
    if(live&&$('autoBlink').checked){
      if(state.time>state.nextBlink){state.blinkStart=state.time;state.nextBlink=state.time+3.5+Math.random()*2.5;}
      const t=state.time-state.blinkStart;
      if(t<.09)blinkPulse=Math.sin(Math.max(0,t)/.09*Math.PI/2);else if(t<.13)blinkPulse=1;else if(t<.29)blinkPulse=.5+.5*Math.cos((t-.13)/.16*Math.PI);
    }
    applyFace(false,blinkPulse);
    if(!state.paused){
      resetBones();root.updateMatrixWorld(true);
      const follow=live&&$('follow').checked&&state.pointerInside&&!state.dragging;
      const target=follow?state.pointer:(live&&$('lookAround').checked?new THREE.Vector2(Math.sin(state.time*.72)*.85,Math.sin(state.time*.53)*.3):new THREE.Vector2());state.look.lerp(target,1-Math.exp(-5*dt));
      motion.update(state.time,dt,state.look,{active:live,breathing:$('breathe').checked,strength:+$('breathStrength').value/100,bodyFollow:$('bodyFollow').checked});
      if(upperChoices)upperChoices.update();root.updateMatrixWorld(true);if($('shortHair').checked)shortHair.update(dt,{wind:live&&lookdev.uniforms.uFinish.value?+$('hairBreeze').value/100:0});if($('braid').checked)braid.update(dt);if(pendantReplay)pendantReplay.update(dt,state.paused);
    }
    const auto=controls.autoRotate;if(state.paused)controls.autoRotate=false;controls.update(dt);controls.autoRotate=auto;
  }
  renderer.render(scene,camera);frames++;
  if(now-fpsStart>1500){
    const fps=Math.round(frames*1000/(now-fpsStart));frames=0;fpsStart=now;
    if(state.ready)$('status').textContent=state.paused?'움직임 정지':`${state.mode==='live'?'LIVE':'360°'} · ${fps} fps`;
    if(window.characterStudio)window.characterStudio.diagnostics={fps,errors:renderFailures.slice(),triangles:renderer.info.render.triangles,braidLengthError:braid.maxLengthError,finite:braid.p.every(p=>[p.x,p.y,p.z].every(Number.isFinite))};
  }
}
requestAnimationFrame(frame);
load().catch(error=>{console.error(error);$('loadingText').textContent=error.message+' 잠시 후 새로고침해주세요.';document.querySelector('.loader').style.display='none';});
