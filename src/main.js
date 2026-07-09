import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* =========================================================================
   CONFIGURAÇÃO DE INTERAÇÕES
   -------------------------------------------------------------------------
   Cada entrada é uma "interação lógica" (não precisa ser 1 mesh só).

   meshNames: lista de meshes que, se tocados, disparam ESSA MESMA interação.
              Útil quando várias peças devem responder junto ao toque em
              qualquer uma delas (ex: tocar em qualquer roda gira as duas).

   type:
     - "toggle"      -> primeiro toque toca a animação pra frente (abre),
                        segundo toque toca ela ao contrário (fecha). Bom pra portas.
     - "once"        -> toca a animação pra frente uma única vez pra sempre (não repete
                        depois, mesmo tocando de novo). Bom pra peça que fica "aberta" de vez.
     - "trigger"      -> toca a animação do início ao fim e para (sem loop). Pode tocar de
                        novo a qualquer momento (toda vez reinicia do começo). Bom pra
                        animações curtas que não têm estado de "ligado/desligado".
     - "spin-toggle" -> primeiro toque começa a girar continuamente, segundo toque para.

   clips: lista de nomes de AnimationClip (batendo com o nome da Action no Blender)
          que devem tocar TODAS JUNTAS quando qualquer um dos meshNames for tocado.

   label: texto amigável mostrado na dica (tooltip) ao passar o mouse (desktop).
   ========================================================================= */
const INTERACTIONS = {
  PortaBateria: {
    meshNames: ['PortaBateria_Mesh'],
    type: 'toggle',
    clips: ['PortaBateria_Abrir'],
    label: 'Porta da bateria'
  },
  PortaEnergia: {
    meshNames: ['PortaEnergia_Mesh'],
    type: 'toggle',
    clips: ['PortaEnergia_Abrir'],
    label: 'Porta de energia'
  },
  CanoParte1: {
    meshNames: ['CanoParte1_Mesh'],
    type: 'toggle',
    clips: ['Cano_Subir_Parte1'],
    label: 'Cano - parte 1'
  },
  CanoParte2: {
    meshNames: ['CanoParte2_Mesh'],
    type: 'toggle',
    clips: ['Cano_Subir_Parte2'],
    label: 'Cano - parte 2'
  },
  Rodas: {
    // Tocar em QUALQUER uma das duas rodas toca a animação das duas juntas.
    // 1º toque: gira pra frente. 2º toque: gira ao contrário, voltando ao estado inicial.
    meshNames: ['RodaEsquerda_Mesh', 'RodaDireita_Mesh'],
    type: 'toggle',
    clips: ['Roda_Girar', 'roda_giraresquerda'], // nomes reais das actions no arquivo (ver observação no README)
    label: 'Rodas'
  }
};

const MODEL_URL = './models/objeto.glb';

/* ========================================================================= */

const canvas = document.getElementById('canvas3d');
const loadingScreen = document.getElementById('loading-screen');
const loadingText = document.getElementById('loading-text');
const hint = document.getElementById('hint');
const tooltip = document.getElementById('tooltip');

// ----- Cena, câmera, renderer -----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14151a);

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
);
camera.position.set(3, 2, 4);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ----- Luzes -----
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x2a2a30, 1.1);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(5, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbfd4ff, 0.6);
fillLight.position.set(-6, 3, -4);
scene.add(fillLight);

// Chão simples pra receber sombra (opcional, ajuda a dar profundidade)
const groundGeo = new THREE.PlaneGeometry(50, 50);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.visible = false; // liga depois que soubermos a altura do modelo
scene.add(ground);

// ----- Controles de câmera (funciona com touch e mouse) -----
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.5;
controls.maxDistance = 20;
controls.target.set(0, 0.5, 0);
controls.update();

// ----- Estado global -----
let mixer = null;
let modelRoot = null;
const clock = new THREE.Clock();

// Guarda o estado de cada interação: se já está "aberto", tocando, etc.
const interactionState = {}; // { meshName: { opened: bool, spinning: bool, action: AnimationAction, once: bool } }

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

// Lista de meshes clicáveis (populada depois de carregar o modelo)
const clickableMeshes = [];

/* ========================================================================= */
/* Carregamento do modelo                                                    */
/* ========================================================================= */

const loader = new GLTFLoader();

loader.load(
  MODEL_URL,
  (gltf) => {
    modelRoot = gltf.scene;
    scene.add(modelRoot);

    modelRoot.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    // Centraliza e enquadra o modelo automaticamente
    fitCameraToObject(modelRoot);

    // Prepara o mixer de animações
    mixer = new THREE.AnimationMixer(modelRoot);

    // Mapeia clipes disponíveis por nome
    const clipsByName = {};
    gltf.animations.forEach((clip) => {
      clipsByName[clip.name] = clip;
    });

    // Para cada interação configurada, localiza TODOS os meshes relacionados
    // na cena (pode ser mais de um, ex: as duas rodas) e cria as
    // AnimationActions relacionadas.
    Object.entries(INTERACTIONS).forEach(([interactionKey, cfg]) => {
      let foundAny = false;

      cfg.meshNames.forEach((meshName) => {
        const meshObj = modelRoot.getObjectByName(meshName);
        if (!meshObj) {
          console.warn(`[aviso] Mesh "${meshName}" não encontrado no modelo.`);
          return;
        }
        foundAny = true;
        clickableMeshes.push(meshObj);
        // Qualquer um desses meshes, ao ser tocado, aciona a MESMA interação lógica.
        meshObj.userData.interactionKey = interactionKey;
      });

      if (!foundAny) return;

      const actions = cfg.clips
        .map((clipName) => {
          const clip = clipsByName[clipName];
          if (!clip) {
            console.warn(`[aviso] Animação "${clipName}" não encontrada no modelo.`);
            return null;
          }
          const action = mixer.clipAction(clip);
          action.clampWhenFinished = true;
          action.loop = THREE.LoopOnce;
          return action;
        })
        .filter(Boolean);

      interactionState[interactionKey] = {
        type: cfg.type,
        actions,
        opened: false,
        spinning: false,
        label: cfg.label || interactionKey
      };
    });

    hideLoadingScreen();
  },
  (progressEvent) => {
    if (progressEvent.total) {
      const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
      loadingText.textContent = `Carregando modelo... ${pct}%`;
    }
  },
  (error) => {
    console.error('Erro ao carregar o modelo:', error);
    loadingText.textContent = 'Erro ao carregar o modelo. Veja o console.';
  }
);

function fitCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fitDistance = maxDim / (2 * Math.tan((Math.PI * camera.fov) / 360));

  camera.position.set(
    center.x + fitDistance * 0.6,
    center.y + fitDistance * 0.45,
    center.z + fitDistance * 0.9
  );
  camera.near = maxDim / 100;
  camera.far = maxDim * 50;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.maxDistance = fitDistance * 6;
  controls.minDistance = fitDistance * 0.15;
  controls.update();

  ground.position.y = box.min.y;
  ground.scale.setScalar(Math.max(maxDim * 4, 10));
  ground.visible = true;
}

function hideLoadingScreen() {
  loadingScreen.classList.add('hidden');
  setTimeout(() => {
    loadingScreen.style.display = 'none';
  }, 500);

  // Esconde a dica de "arraste para girar" depois de um tempo
  setTimeout(() => {
    hint.style.opacity = '0';
  }, 4000);
}

/* ========================================================================= */
/* Interação: toque/clique para acionar animações                           */
/* ========================================================================= */

let pointerDownPos = { x: 0, y: 0 };
let pointerDownTime = 0;
const TAP_MAX_DISTANCE = 8; // px - acima disso, consideramos "arrastar" (girar câmera), não "toque"
const TAP_MAX_DURATION = 500; // ms

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  pointerDownTime = performance.now();
});

renderer.domElement.addEventListener('pointerup', (e) => {
  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const duration = performance.now() - pointerDownTime;

  // Só considera "toque" (não giro de câmera) se moveu pouco e foi rápido
  if (dist <= TAP_MAX_DISTANCE && duration <= TAP_MAX_DURATION) {
    handleTap(e.clientX, e.clientY);
  }
});

// Hover (desktop) - mostra tooltip com o nome da peça
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return; // tooltip só faz sentido com mouse
  const hit = getIntersectedInteractiveMesh(e.clientX, e.clientY);
  if (hit) {
    const key = getInteractionKey(hit);
    const state = interactionState[key];
    tooltip.textContent = state ? state.label : '';
    tooltip.style.left = `${e.clientX}px`;
    tooltip.style.top = `${e.clientY}px`;
    tooltip.classList.add('visible');
    renderer.domElement.style.cursor = 'pointer';
  } else {
    tooltip.classList.remove('visible');
    renderer.domElement.style.cursor = 'default';
  }
});

function handleTap(clientX, clientY) {
  const hit = getIntersectedInteractiveMesh(clientX, clientY);
  if (!hit) return;

  const key = getInteractionKey(hit);
  const state = interactionState[key];
  if (!state || state.actions.length === 0) return;

  triggerInteraction(state);
}

function getIntersectedInteractiveMesh(clientX, clientY) {
  if (clickableMeshes.length === 0) return null;

  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointerNDC, camera);
  const intersects = raycaster.intersectObjects(clickableMeshes, true);

  if (intersects.length === 0) return null;

  // Sobe na hierarquia até achar o mesh que está registrado como interativo
  let obj = intersects[0].object;
  while (obj && !obj.userData.interactionKey) {
    obj = obj.parent;
  }
  return obj;
}

function getInteractionKey(obj) {
  return obj.userData.interactionKey;
}

function triggerInteraction(state) {
  switch (state.type) {
    case 'toggle': {
      const goingForward = !state.opened;
      state.actions.forEach((action) => {
        action.reset();
        action.timeScale = goingForward ? 1 : -1;
        // Se estiver invertendo, começa do fim
        if (!goingForward) {
          action.time = action.getClip().duration;
        }
        action.paused = false;
        action.play();
      });
      state.opened = goingForward;
      break;
    }

    case 'once': {
      if (state.opened) return; // já tocou, não repete
      state.actions.forEach((action) => {
        action.reset();
        action.timeScale = 1;
        action.play();
      });
      state.opened = true;
      break;
    }

    case 'trigger': {
      // Sempre reinicia do começo e toca uma vez, sem loop. Pode repetir à vontade.
      state.actions.forEach((action) => {
        action.stop();
        action.reset();
        action.timeScale = 1;
        action.loop = THREE.LoopOnce;
        action.clampWhenFinished = true;
        action.play();
      });
      break;
    }

    case 'spin-toggle': {
      state.spinning = !state.spinning;
      state.actions.forEach((action) => {
        if (state.spinning) {
          action.reset();
          action.loop = THREE.LoopRepeat;
          action.clampWhenFinished = false;
          action.timeScale = 1;
          action.play();
        } else {
          action.paused = true;
        }
      });
      break;
    }
  }
}

/* ========================================================================= */
/* Loop de renderização                                                      */
/* ========================================================================= */

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (mixer) mixer.update(delta);
  controls.update();

  renderer.render(scene, camera);
}
animate();

/* ========================================================================= */
/* Responsivo                                                                */
/* ========================================================================= */

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
