import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

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
    label: 'Bateria',
    title: 'Bateria',
    description: 'Compartimento da bateria — a fonte de energia que faz o equipamento funcionar.'
  },
  PortaEnergia: {
    meshNames: ['PortaEnergia_Mesh'],
    type: 'toggle',
    clips: ['PortaEnergia_Abrir'],
    label: 'Energia',
    title: 'Entrada de Energia',
    description: 'Ponto de entrada de energia do equipamento, usado para carregamento e conexão.'
  },
  CanoParte1: {
    meshNames: ['CanoParte1_Mesh'],
    type: 'toggle',
    clips: ['Cano_Subir_Parte1'],
    label: 'Extensor da câmera',
    title: 'Extensor da Câmera',
    description: 'Mecanismo de extensão que eleva a câmera, ampliando o campo de visão.'
  },
  CanoParte2: {
    meshNames: ['CanoParte2_Mesh'],
    type: 'toggle',
    clips: ['Cano_Subir_Parte2'],
    label: 'Extensor da câmera',
    title: 'Extensor da Câmera',
    description: 'Segundo estágio do mecanismo de extensão, elevando ainda mais a câmera.'
  },
  Rodas: {
    // Tocar em QUALQUER uma das duas rodas toca a animação das duas juntas.
    // 1º toque: gira pra frente. 2º toque: gira ao contrário, voltando ao estado inicial.
    meshNames: ['RodaEsquerda_Mesh', 'RodaDireita_Mesh'],
    type: 'toggle',
    clips: ['Roda_Girar', 'roda_giraresquerda'], // nomes reais das actions no arquivo (ver observação no README)
    label: 'Painel Solar',
    title: 'Painel Solar',
    description: 'Painéis responsáveis pela captação de energia solar, contribuindo para a autonomia do equipamento.'
  }
};

const MODEL_URL = './models/objeto.glb';
const CENARIO_URL = './models/cenario.glb';

/* ========================================================================= */

const canvas = document.getElementById('canvas3d');
const introScreen = document.getElementById('intro-screen');
const introProgressBar = document.getElementById('intro-progress-bar');
const introStatus = document.getElementById('intro-status');
const introStartBtn = document.getElementById('intro-start-btn');
const hint = document.getElementById('hint');
const tooltip = document.getElementById('tooltip');
const infoPanel = document.getElementById('info-panel');
const infoPanelTitle = document.getElementById('info-panel-title');
const infoPanelDesc = document.getElementById('info-panel-desc');
const infoPanelClose = document.getElementById('info-panel-close');

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
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ----- Ambiente de iluminação global (equivalente ao "World"/HDRI do Blender) -----
// Sem isso, materiais PBR (MeshStandardMaterial) exportados do Blender ficam
// escuros em qualquer área que as luzes diretas não atingem diretamente,
// porque não existe luz indireta/reflexo ambiente pra preencher as sombras.
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
pmremGenerator.dispose();

// ----- Luzes -----
// Luz ambiente geral - reforço extra além do ambiente global (RoomEnvironment)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x4a4a55, 1.2);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(5, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbfd4ff, 1.0);
fillLight.position.set(-6, 3, -4);
scene.add(fillLight);

// Luz extra de trás/cima pra clarear áreas que ficam escuras
const backLight = new THREE.DirectionalLight(0xffffff, 0.8);
backLight.position.set(0, 6, -8);
scene.add(backLight);

// Ponto de luz extra perto do objeto pra garantir que nada fique no escuro
const fillPoint = new THREE.PointLight(0xffffff, 1.0, 30);
fillPoint.position.set(0, 4, 6);
scene.add(fillPoint);

// Chão simples pra receber sombra (opcional, ajuda a dar profundidade)
const groundGeo = new THREE.PlaneGeometry(50, 50);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.visible = false; // liga depois que soubermos a altura do modelo
scene.add(ground);

// ----- Bloom seletivo (só as peças "luminosas" do cenário brilham) -----
const BLOOM_LAYER = 1;
const bloomLayer = new THREE.Layers();
bloomLayer.set(BLOOM_LAYER);

const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
const materialCache = {};

const renderScenePass = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.2, // strength (intensidade do brilho) - bem reduzida
  0.3, // radius (espalhamento do brilho)
  0.6 // threshold (só coisas MUITO claras brilham)
);

const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(renderScenePass);
bloomComposer.addPass(bloomPass);

const mixShader = {
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: bloomComposer.renderTarget2.texture }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(baseTexture, vUv) + vec4(1.0) * texture2D(bloomTexture, vUv);
    }
  `
};

const mixPass = new ShaderPass(
  new THREE.ShaderMaterial({
    uniforms: mixShader.uniforms,
    vertexShader: mixShader.vertexShader,
    fragmentShader: mixShader.fragmentShader,
    defines: {}
  }),
  'baseTexture'
);
mixPass.needsSwap = true;

const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(renderScenePass);
finalComposer.addPass(mixPass);

function darkenNonBloomed(obj) {
  if (obj.isMesh && bloomLayer.test(obj.layers) === false) {
    materialCache[obj.uuid] = obj.material;
    obj.material = darkMaterial;
  }
}

function restoreMaterial(obj) {
  if (materialCache[obj.uuid]) {
    obj.material = materialCache[obj.uuid];
    delete materialCache[obj.uuid];
  }
}

function renderWithBloom() {
  scene.traverse(darkenNonBloomed);
  bloomComposer.render();
  scene.traverse(restoreMaterial);
  finalComposer.render();
}

// ----- Câmera fixa (não há mais controle de órbita da câmera) -----
// Quem gira agora é o objeto (modelRoot), arrastado pelo usuário - ver mais abaixo.

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

const loadingManager = new THREE.LoadingManager();
const loader = new GLTFLoader(loadingManager);

let cenarioRoot = null;

loadingManager.onProgress = (url, loaded, total) => {
  if (total) {
    const pct = Math.round((loaded / total) * 100);
    introProgressBar.style.width = `${pct}%`;
    introStatus.textContent = `Carregando... ${pct}%`;
  }
};

loadingManager.onLoad = () => {
  onEverythingLoaded();
  hideLoadingScreen();
};

loadingManager.onError = (url) => {
  console.error('Erro ao carregar:', url);
  introStatus.textContent = 'Erro ao carregar. Veja o console.';
};

// ----- Modelo principal (objeto interativo) -----
loader.load(MODEL_URL, (gltf) => {
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
      label: cfg.label || interactionKey,
      title: cfg.title || cfg.label || interactionKey,
      description: cfg.description || ''
    };
  });
});

// ----- Cenário (ambiente ao redor do objeto) -----
loader.load(CENARIO_URL, (gltf) => {
  cenarioRoot = gltf.scene;
  scene.add(cenarioRoot);

  cenarioRoot.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;

    // Se o material tiver emissivo (as "luzes" do cenário), marca essa peça
    // pra brilhar no efeito de bloom.
    const mat = obj.material;
    const hasEmissive =
      mat &&
      mat.emissive &&
      (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0);

    if (hasEmissive) {
      obj.layers.enable(BLOOM_LAYER);
    }
  });
});

function onEverythingLoaded() {
  if (cenarioRoot) {
    // O cenário provavelmente já tem piso/paredes próprios — esconde o chão genérico.
    ground.visible = false;
  }
}

// ----- Zoom (scroll) -----
// ZOOM_MAX_FACTOR = a posição atual (mais afastada) — é o limite de quanto dá pra "voltar o zoom".
// ZOOM_MIN_FACTOR = o quanto a câmera pode se aproximar do objeto.
// Conforme dá zoom (se aproxima), a câmera também sobe um pouco (ELEVATION_EXTRA),
// olhando de um ângulo levemente mais de cima, mas sempre por cima do objeto (nunca abaixo).
const ZOOM_MAX_FACTOR = 2.9;
const ZOOM_MIN_FACTOR = 1.2;
const ELEVATION_BASE = 0.15;
const ELEVATION_EXTRA = 0.35;
const ZOOM_WHEEL_SPEED = 0.0015;

let orbitCenter = new THREE.Vector3();
let orbitFitDistance = 1;
let zoomFactor = ZOOM_MAX_FACTOR;

function updateCameraZoom() {
  // t = 0 no zoom mais afastado, t = 1 no zoom mais próximo
  const t = (ZOOM_MAX_FACTOR - zoomFactor) / (ZOOM_MAX_FACTOR - ZOOM_MIN_FACTOR);
  const elevationRatio = ELEVATION_BASE + t * ELEVATION_EXTRA;

  camera.position.set(
    orbitCenter.x + orbitFitDistance * zoomFactor,
    orbitCenter.y + orbitFitDistance * zoomFactor * elevationRatio,
    orbitCenter.z
  );
  camera.lookAt(orbitCenter);
}

renderer.domElement.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    zoomFactor += e.deltaY * ZOOM_WHEEL_SPEED;
    zoomFactor = THREE.MathUtils.clamp(zoomFactor, ZOOM_MIN_FACTOR, ZOOM_MAX_FACTOR);
    updateCameraZoom();
  },
  { passive: false }
);

function fitCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fitDistance = maxDim / (2 * Math.tan((Math.PI * camera.fov) / 360));

  orbitCenter.copy(center);
  orbitFitDistance = fitDistance;
  zoomFactor = ZOOM_MAX_FACTOR;

  camera.near = maxDim / 100;
  camera.far = maxDim * 50;
  updateCameraZoom();
  camera.updateProjectionMatrix();

  ground.position.y = box.min.y;
  ground.scale.setScalar(Math.max(maxDim * 4, 10));
  ground.visible = true;
}

function hideLoadingScreen() {
  introProgressBar.style.width = '100%';
  introStatus.textContent = 'Pronto!';
  introStartBtn.classList.add('visible');
}

introStartBtn.addEventListener('click', () => {
  introScreen.classList.add('hidden');
  setTimeout(() => {
    introScreen.style.display = 'none';
  }, 600);

  // Esconde a dica de "arraste para girar" depois de um tempo
  setTimeout(() => {
    hint.style.opacity = '0';
  }, 4000);
});

/* ========================================================================= */
/* Interação: toque/clique para acionar animações                           */
/* ========================================================================= */

let pointerDownPos = { x: 0, y: 0 };
let pointerDownTime = 0;
const TAP_MAX_DISTANCE = 8; // px - acima disso, consideramos "arrastar" (girar o objeto), não "toque"
const TAP_MAX_DURATION = 500; // ms

// ----- Arrastar para girar (só o objeto, a câmera fica parada) -----
let isDragging = false;
let dragLastX = 0;
let dragVelocityY = 0; // usado pra desacelerar suavemente quando solta o arraste
const DRAG_ROTATE_SPEED = 0.01; // sensibilidade do arraste
const DRAG_DAMPING = 0.90; // quão rápido a rotação desacelera depois de soltar

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  pointerDownTime = performance.now();
  isDragging = true;
  dragLastX = e.clientX;
  dragVelocityY = 0;
  renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (isDragging && modelRoot) {
    const dx = e.clientX - dragLastX;
    dragLastX = e.clientX;
    const deltaRotation = dx * DRAG_ROTATE_SPEED;
    modelRoot.rotation.y += deltaRotation;
    dragVelocityY = deltaRotation;
  }
});

renderer.domElement.addEventListener('pointerup', (e) => {
  isDragging = false;

  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const duration = performance.now() - pointerDownTime;

  // Só considera "toque" (não giro do objeto) se moveu pouco e foi rápido
  if (dist <= TAP_MAX_DISTANCE && duration <= TAP_MAX_DURATION) {
    handleTap(e.clientX, e.clientY);
  }
});

renderer.domElement.addEventListener('pointercancel', () => {
  isDragging = false;
});

function updateModelDragRotation(delta) {
  if (isDragging || !modelRoot) return;
  // Desacelera suavemente a rotação depois que o usuário solta o arraste
  if (Math.abs(dragVelocityY) > 0.0001) {
    modelRoot.rotation.y += dragVelocityY;
    dragVelocityY *= DRAG_DAMPING;
  }
}

// Hover (desktop) - mostra tooltip com o nome da peça
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return; // tooltip só faz sentido com mouse
  if (isDragging) return; // não mostra tooltip enquanto está girando o objeto
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
  showInfoPanel(state);
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

let infoPanelHideTimeout = null;

function showInfoPanel(state) {
  if (!state.title && !state.description) return;

  infoPanelTitle.textContent = state.title;
  infoPanelDesc.textContent = state.description;
  infoPanel.classList.add('visible');

  // Reinicia o temporizador de auto-esconder toda vez que uma nova peça é tocada
  if (infoPanelHideTimeout) clearTimeout(infoPanelHideTimeout);
  infoPanelHideTimeout = setTimeout(() => {
    infoPanel.classList.remove('visible');
  }, 7000);
}

infoPanelClose.addEventListener('click', () => {
  infoPanel.classList.remove('visible');
  if (infoPanelHideTimeout) clearTimeout(infoPanelHideTimeout);
});

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
  updateModelDragRotation(delta);

  renderWithBloom();
}
animate();

/* ========================================================================= */
/* Responsivo                                                                */
/* ========================================================================= */

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  bloomComposer.setSize(window.innerWidth, window.innerHeight);
  finalComposer.setSize(window.innerWidth, window.innerHeight);
});
