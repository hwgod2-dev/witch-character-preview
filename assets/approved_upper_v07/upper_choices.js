import * as THREE from '../../vendor/three.module.js';
export async function installUpperChoices(studio){
 const data=await(await fetch('./assets/approved_upper_v07/poses.json')).json();let current='current';
 const corrections=await(await fetch('./assets/approved_upper_v07/correctives.json')).json(),bytes=await(await fetch('./assets/approved_upper_v07/correctives.bin')).arrayBuffer();
 const original=new Map();for(const rows of Object.values(corrections.poses))for(const row of rows){if(!original.has(row.part)){const g=studio.meshes[row.part].geometry;original.set(row.part,{position:new Float32Array(g.attributes.position.array),normal:new Float32Array(g.attributes.normal.array)});}}
 function surface(id){for(const [part,old]of original){const g=studio.meshes[part].geometry,row=corrections.poses[id]?.find(r=>r.part===part);for(const key of ['position','normal']){const src=row?new Float32Array(bytes,row[key].offset,row[key].count):old[key];g.attributes[key].array.set(src);g.attributes[key].needsUpdate=true;}}}
 const all={current:{}};for(const pose of data.poses)all[pose.id]=pose.bones;
 const panel=document.createElement('section');panel.className='controls';panel.innerHTML='<h3>상체 포즈 선택</h3><p class="hint">하체는 같은 자세입니다. 어깨·팔·손가락을 원본 모션에서 가져와 손 위치를 의상에 맞췄습니다.</p><div class="expressions"><button data-upper="current" aria-pressed="true">현재 승인본</button>'+data.poses.map(p=>`<button data-upper="${p.id}" aria-pressed="false">${{A:'A · 양손 기본',B:'B · 양손 낮게',C:'C · 한 손'}[p.id]}</button>`).join('')+'</div><p id="upperSource" class="hint">현재 승인한 팔·손 자세</p>';
 document.querySelector('aside .mode-tabs').before(panel);const label=panel.querySelector('#upperSource');
 panel.querySelectorAll('button').forEach(button=>button.onclick=()=>{current=button.dataset.upper;surface(current);studio.setMode('orbit');panel.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));const pose=data.poses.find(p=>p.id===current);label.textContent=pose?`${pose.title} / Mixamo ${pose.clip}, ${pose.source_frame}프레임`:'현재 승인한 팔·손 자세';});
 const m=new THREE.Matrix4();const refs=new Map(studio.bones.map(b=>[b.name,b]));
 return {update(){for(const [name,pose]of Object.entries(all[current])){const bone=refs.get(name);if(bone){m.fromArray(pose.matrix).decompose(bone.position,bone.quaternion,bone.scale);bone.updateMatrix();}}}};
}
