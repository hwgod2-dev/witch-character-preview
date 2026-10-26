import { Vector3, Quaternion, Matrix4 } from './vendor/three.module.js';

// Position-based rope: gravity and geometric constraints; no angular spring target.
export class BraidPhysics {
  constructor(bones, allBones, colliderData) {
    this.bones = bones;
    this.head = allBones.find(b => b.name === 'mixamorig:Head');
    this.headRest = this.head.getWorldQuaternion(new Quaternion());
    this.rest = bones.map(b => ({ q: b.getWorldQuaternion(new Quaternion()), p: b.getWorldPosition(new Vector3()) }));
    const end = new Vector3().fromArray(bones.at(-1).userData.tail);
    this.original = this.rest.map(v => v.p.clone()); this.original.push(end);
    this.restDir = bones.map((_, i) => this.original[i+1].clone().sub(this.original[i]).normalize());
    this.colliders = colliderData.map(c => ({ bone:allBones[c.bone], local:new Matrix4().fromArray(c.matrix) }));
    this.p = []; this.previous = []; this.lengths = [];
    for (let i=0;i<bones.length;i++) {
      this.p.push(this.original[i].clone(),this.original[i].clone().lerp(this.original[i+1],.5));
    }
    this.p.push(end.clone());
    this.previous=this.p.map(p=>p.clone());
    this.lengths=this.p.slice(1).map((p,i)=>p.distanceTo(this.p[i]));
    this.accumulator=0; this.maxLengthError=0;
  }
  reset() {
    const anchor=this.bones[0].getWorldPosition(new Vector3());
    const delta=this.head.getWorldQuaternion(new Quaternion()).multiply(this.headRest.clone().invert());
    for(let i=0;i<this.p.length;i++) {
      const segment=Math.min(Math.floor(i/2),this.original.length-2), t=i===this.p.length-1?1:(i%2)*.5;
      this.p[i].copy(this.original[segment]).lerp(this.original[segment+1],t).sub(this.original[0]).applyQuaternion(delta).add(anchor);
      this.previous[i].copy(this.p[i]);
    }
    this.accumulator=0;
  }
  update(dt) {
    this.accumulator+=Math.min(Math.max(dt,0),.05);
    const anchor=this.bones[0].getWorldPosition(new Vector3());
    const bodies=this.colliders.map(c=>{
      const m=c.bone.matrixWorld.clone().multiply(c.local), center=new Vector3(), q=new Quaternion(), r=new Vector3();
      m.decompose(center,q,r); return {center,q,inv:q.clone().invert(),r};
    });
    const step=1/120; let steps=0;
    while(this.accumulator>=step&&steps++<8) {
      for(let i=1;i<this.p.length;i++) {
        const v=this.p[i].clone().sub(this.previous[i]).multiplyScalar(Math.exp(-3.4*step));
        this.previous[i].copy(this.p[i]);this.p[i].add(v);this.p[i].y-=9.81*step*step;
      }
      for(let iteration=0;iteration<20;iteration++) {
        this.p[0].copy(anchor);
        for(let i=0;i<this.lengths.length;i++) this.constrain(i,i+1,this.lengths[i]);
        // Bending limit preserves the plait's volume without restoring old angles.
        for(let i=0;i<this.lengths.length-1;i++) {
          const min=.963*(this.lengths[i]+this.lengths[i+1]);
          if(this.p[i].distanceTo(this.p[i+2])<min) this.constrain(i,i+2,min);
        }
        for(let i=1;i<this.p.length;i++) for(const b of bodies) {
          const radius=.027*(1-i/(this.p.length-1)*.18);
          const radii=b.r.clone().addScalar(radius);
          const local=this.p[i].clone().sub(b.center).applyQuaternion(b.inv).divide(radii);
          const length=local.length();
          if(length<1) {
            if(length<1e-8) local.set(0,0,-1);else local.divideScalar(length);
            this.p[i].copy(local.multiply(radii).applyQuaternion(b.q).add(b.center));
          }
        }
      }
      this.p[0].copy(anchor);this.accumulator-=step;
    }
    const headDelta=this.head.getWorldQuaternion(new Quaternion()).multiply(this.headRest.clone().invert());
    for(let i=0;i<this.bones.length;i++) {
      const bone=this.bones[i], dir=this.p[i*2+2].clone().sub(this.p[i*2]).normalize();
      const refDir=this.restDir[i].clone().applyQuaternion(headDelta);
      const q=new Quaternion().setFromUnitVectors(refDir,dir).multiply(headDelta).multiply(this.rest[i].q);
      const world=new Matrix4().compose(this.p[i*2],q,new Vector3(1,1,1));
      const local=bone.parent.matrixWorld.clone().invert().multiply(world);
      local.decompose(bone.position,bone.quaternion,bone.scale);bone.updateMatrixWorld(true);
    }
    this.maxLengthError=Math.max(...this.lengths.map((l,i)=>Math.abs(this.p[i+1].distanceTo(this.p[i])/l-1)));
  }
  constrain(a,b,length) {
    const d=this.p[b].clone().sub(this.p[a]); const current=d.length(); if(current<1e-10)return;
    d.multiplyScalar((current-length)/current);
    if(a===0) this.p[b].sub(d);else {this.p[a].addScaledVector(d,.5);this.p[b].addScaledVector(d,-.5);}
  }
}
