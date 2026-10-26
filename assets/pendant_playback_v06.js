import * as THREE from '../vendor/three.module.js';
export async function installPendantReplay(studio){
 const cache=await(await fetch('./assets/approved_v06/pendant_playback.json')).json();
 const bones={L:studio.bones.find(b=>b.name==='Pendant_L_01'),R:studio.bones.find(b=>b.name==='Pendant_R_01')};
 let time=(cache.frames.length-1)/cache.fps,playing=false;
 const panel=document.createElement('section');panel.className='controls';panel.innerHTML='<h3>뒤쪽 부착점 · 장식 물리</h3><p class="hint">Blender에서 계산한 6초 움직임을 재생합니다. 끝나면 정착한 자세로 멈춥니다.</p><button id="pendantReplay">장식 움직임 다시 보기</button><p id="pendantReplayState" class="hint">정착한 상태</p>';
 document.querySelector('aside .mode-tabs').before(panel);const label=panel.querySelector('#pendantReplayState');
 panel.querySelector('button').onclick=()=>{time=0;playing=true;label.textContent='Blender 물리 재생 중';};
 const q0=new THREE.Quaternion(),q1=new THREE.Quaternion(),p0=new THREE.Vector3(),p1=new THREE.Vector3();
 return {update(dt,paused){
  if(paused)return;if(playing){time+=dt;if(time>=(cache.frames.length-1)/cache.fps){time=(cache.frames.length-1)/cache.fps;playing=false;label.textContent='정착한 상태';}}
  const f=time*cache.fps,a=Math.floor(f),b=Math.min(a+1,cache.frames.length-1),t=f-a;
  for(const side of ['L','R']){const bone=bones[side],x=cache.frames[a][side],y=cache.frames[b][side];bone.position.copy(p0.fromArray(x.p).lerp(p1.fromArray(y.p),t));bone.quaternion.copy(q0.fromArray(x.q).slerp(q1.fromArray(y.q),t));bone.updateMatrix();bone.updateMatrixWorld(true);}
 }};
}
