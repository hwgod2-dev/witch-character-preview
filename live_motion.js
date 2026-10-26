import {Vector2, Vector3, Quaternion, Euler} from './vendor/three.module.js';

export class LiveMotion {
  constructor(bones) {
    this.map=new Map(bones.map(b=>[b.name,b]));this.bodyLook=new Vector2();
    this.hands=['Left','Right'].map(side=>({side, p:this.map.get(`mixamorig:${side}Hand`).getWorldPosition(new Vector3()), q:this.map.get(`mixamorig:${side}Hand`).getWorldQuaternion(new Quaternion())}));
  }
  rotate(name,yaw,pitch,roll=0) {
    const bone=this.map.get(name);if(!bone)return;
    const parent=bone.parent.getWorldQuaternion(new Quaternion());
    const delta=new Quaternion().setFromEuler(new Euler(pitch,yaw,roll,'YXZ'));
    bone.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));bone.updateMatrixWorld(true);
  }
  moveWorld(name,offset) {
    const bone=this.map.get(name), p=bone.getWorldPosition(new Vector3()).add(offset);
    bone.position.copy(bone.parent.worldToLocal(p));bone.updateMatrixWorld(true);
  }
  holdHands() {
    // P5 hands rest at the waist. Preserve their contacts while the ribcage breathes.
    for(const hand of this.hands) {
      const upper=this.map.get(`mixamorig:${hand.side}Arm`),lower=this.map.get(`mixamorig:${hand.side}ForeArm`),wrist=this.map.get(`mixamorig:${hand.side}Hand`);
      const a=upper.getWorldPosition(new Vector3()),b=lower.getWorldPosition(new Vector3()),c=wrist.getWorldPosition(new Vector3());
      const l1=a.distanceTo(b),l2=b.distanceTo(c),direction=hand.p.clone().sub(a),distance=Math.min(direction.length(),l1+l2-1e-5);direction.normalize();
      const across=b.clone().sub(a).addScaledVector(direction,-b.clone().sub(a).dot(direction)).normalize();
      const along=(distance*distance+l1*l1-l2*l2)/(2*distance);
      const elbow=a.clone().addScaledVector(direction,along).addScaledVector(across,Math.sqrt(Math.max(0,l1*l1-along*along)));
      const swing=(bone,from,to)=>{const q=new Quaternion().setFromUnitVectors(from.normalize(),to.normalize()).multiply(bone.getWorldQuaternion(new Quaternion()));bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(q));bone.updateMatrixWorld(true);};
      swing(upper,b.clone().sub(a),elbow.clone().sub(a));
      const elbowNow=lower.getWorldPosition(new Vector3());
      swing(lower,wrist.getWorldPosition(new Vector3()).sub(elbowNow),hand.p.clone().sub(elbowNow));
      wrist.quaternion.copy(wrist.parent.getWorldQuaternion(new Quaternion()).invert().multiply(hand.q));wrist.updateMatrixWorld(true);
    }
  }
  update(time,dt,look,{active=true,breathing=true,strength=1,bodyFollow=true}={}) {
    this.bodyLook.lerp(active&&bodyFollow?look:new Vector2(),1-Math.exp(-2.2*dt));
    const breath=active&&breathing?(Math.sin(time*Math.PI*2/5.2-Math.PI/2)+1)*.5*strength:0;
    const sway=active&&breathing?Math.sin(time*.64)*.004:0;
    this.rotate('mixamorig:Spine',this.bodyLook.x*.018,0,sway*.3);
    this.rotate('mixamorig:Spine1',this.bodyLook.x*.030,-this.bodyLook.y*.010-breath*.007,sway*.5);
    this.rotate('mixamorig:Spine2',this.bodyLook.x*.038,-this.bodyLook.y*.012-breath*.006,sway*.2);
    const chest=this.map.get('mixamorig:Spine2');
    const childFrames=chest.children.map(b=>[b,b.matrixWorld.clone()]);
    chest.scale.x*=1+breath*.006;chest.scale.z*=1+breath*.015;chest.updateMatrixWorld(true);
    for(const [child,world] of childFrames){chest.matrixWorld.clone().invert().multiply(world).decompose(child.position,child.quaternion,child.scale);child.updateMatrixWorld(true);}
    this.moveWorld('mixamorig:Spine2',new Vector3(0,breath*.0032,breath*.001));
    for(const side of ['Left','Right'])this.moveWorld(`mixamorig:${side}Shoulder`,new Vector3(0,breath*.001,0));
    this.holdHands();
    this.rotate('mixamorig:Neck',look.x*.07,-look.y*.045);
    this.rotate('mixamorig:Head',look.x*.22+(active&&breathing?Math.sin(time*.6)*.006:0),-look.y*.11,active&&breathing?Math.sin(time*.43)*.005:0);
    this.breath=breath;
  }
}

// Short locks retain their authored outline, but their tips lag behind head acceleration.
export class ShortHairPhysics {
  constructor(bones,colliders=[]) {
    this.head=bones.find(b=>b.name==='mixamorig:Head');
    const inverse=this.head.matrixWorld.clone().invert();
    this.chains=[];this.accumulator=0;this.windTime=0;
    for(let i=0;i<8;i++) {
      const chain=[1,2].map(j=>bones.find(b=>b.name===`HairTip${String(i).padStart(2,'0')}_0${j}`));
      const points=chain.map(b=>b.getWorldPosition(new Vector3()));points.push(new Vector3().fromArray(chain[1].userData.tail));
      this.chains.push({bones:chain,local:points.map(p=>p.clone().applyMatrix4(inverse)),p:points.map(p=>p.clone()),v:points.map(()=>new Vector3()),q:chain.map(b=>b.getWorldQuaternion(new Quaternion())),headQ:this.head.getWorldQuaternion(new Quaternion()),lengths:[points[0].distanceTo(points[1]),points[1].distanceTo(points[2])]});
    }
  }
  reset(){for(const c of this.chains)c.p.forEach((p,i)=>{p.copy(c.local[i]).applyMatrix4(this.head.matrixWorld);c.v[i].set(0,0,0);});this.accumulator=0;}
  update(dt,{wind=0}={}) {
    const delta=this.head.getWorldQuaternion(new Quaternion());this.accumulator+=Math.min(dt,.05);
    const targets=this.chains.map(c=>c.local.map(p=>p.clone().applyMatrix4(this.head.matrixWorld)));
    const h=1/120;
    while(this.accumulator>=h) {
      this.windTime+=h;
      this.chains.forEach((c,k)=>{
        const target=targets[k],old=c.p.map(p=>p.clone());c.p[0].copy(target[0]);
        for(let j=1;j<3;j++){
          c.v[j].addScaledVector(target[j].clone().sub(c.p[j]),(j===1?95:55)*h).multiplyScalar(Math.exp(-5.5*h));
          const gust=.65+.22*Math.sin(this.windTime*.7)+.13*Math.sin(this.windTime*1.31);
          c.v[j].x+=wind*.32*gust*Math.sin(this.windTime*1.45+k*.73)*h;
          c.v[j].z+=wind*.16*gust*Math.sin(this.windTime*1.12+k*.57)*h;
          c.v[j].y-=.18*h;c.p[j].addScaledVector(c.v[j],h);
        }
        for(let j=1;j<3;j++) {
          const authored=target[j].clone().sub(target[j-1]).normalize(),dir=c.p[j].clone().sub(c.p[j-1]).normalize();
          const angle=authored.angleTo(dir),limit=j===1?.075:.13;
          if(angle>limit){const turn=new Quaternion().setFromUnitVectors(authored,dir).slerp(new Quaternion(),1-limit/angle);dir.copy(authored).applyQuaternion(turn);}
          c.p[j].copy(c.p[j-1]).addScaledVector(dir,c.lengths[j-1]);
          c.v[j].copy(c.p[j]).sub(old[j]).divideScalar(h);
        }
      });this.accumulator-=h;
    }
    this.maxLag=0;
    this.chains.forEach((c,k)=>{
      const headDelta=delta.clone().multiply(c.headQ.clone().invert());
      c.bones.forEach((bone,j)=>{
        const ref=targets[k][j+1].clone().sub(targets[k][j]).normalize(),actual=c.p[j+1].clone().sub(c.p[j]).normalize();
        const q=new Quaternion().setFromUnitVectors(ref,actual).multiply(headDelta).multiply(c.q[j]);
        bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(q));bone.updateMatrixWorld(true);
      });
      this.maxLag=Math.max(this.maxLag,c.p[2].distanceTo(targets[k][2]));
    });
  }
}
