import * as THREE from '../vendor/three.module.js';
import { RectAreaLightUniformsLib } from '../vendor/RectAreaLightUniformsLib.js';

// Blender reference: broad key left/front, low fill right, rear rim, Standard color display.
export class StudioLighting {
  constructor(scene,renderer){
    RectAreaLightUniformsLib.init();this.scene=scene;this.renderer=renderer;
    this.legacy=scene.children.filter(o=>o.isLight);this.group=new THREE.Group();scene.add(this.group);
    this.fill=new THREE.HemisphereLight(0xe8e9ef,0x777273,.32);this.group.add(this.fill);
    for(const [pos,power,size] of [[[-2,4,3],3.4,3],[[2,2,1],1.45,3],[[1,3,-2],3.8,2]]){
      const l=new THREE.RectAreaLight(0xffffff,power,size,size);l.position.set(...pos);l.lookAt(0,1,0);this.group.add(l);
    }
    this.enabled=true;this.set(true);
  }
  set(on){
    this.enabled=on;this.legacy.forEach(l=>l.visible=!on);this.group.visible=on;
    // Broad area lights do not cast harsh directional shadow-map seams.
    this.renderer.toneMapping=on?THREE.NoToneMapping:THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=on?1:1.05;
    this.scene.environmentIntensity=on?.18:.5;
    document.querySelector('.stage').classList.toggle('clean-light',on);
  }
  brightness(value){
    if(this.enabled){this.group.traverse(l=>{if(l.isLight){l.userData.baseIntensity??=l.intensity;l.intensity=l.userData.baseIntensity*value;}});}
    else this.renderer.toneMappingExposure=1.05*value;
  }
}
