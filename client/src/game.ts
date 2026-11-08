import * as THREE from "three";
import type { CharacterConfig, PlayerState } from "@quan-ca-phe/shared";

type GameCallbacks = {
  onExit: () => void;
  startPosition?: { x: number; z: number };
  onPosition?: (x: number, z: number, vx: number, vz: number) => void;
  onChat?: (text: string) => void;
  onEmote?: (emote: "wave" | "jump" | "cheers") => void;
  onRemoteReady?: (api: {
    addRemotePlayer: (state: PlayerState) => void;
    removeRemotePlayer: (playerId: string) => void;
    showRemoteChat: (playerId: string, text: string) => void;
    playRemoteEmote: (playerId: string, emote: "wave" | "jump" | "cheers") => void;
  }) => void;
};

const ROOM_WIDTH = 18;
const ROOM_DEPTH = 12;
const PLAYER_RADIUS = 0.38;
const MOVEMENT = {
  maxSpeed: 4.2,
  acceleration: 22,
  deceleration: 28,
  turnSharpness: 14,
  fixedStep: 1 / 60,
  cameraSharpness: 10,
  joystickDeadZone: 0.12,
} as const;

const PALETTE = {
  skin: "#f2bd88",
  skinDark: "#d98f68",
  shirt: "#5b8f82",
  apron: "#f1c276",
  hair: "#59443b",
  hat: "#bd6b39",
  eye: "#3d2c22",
  blush: "#e98f7d",
  shadow: "#6d493a",
  marker: "#f7d36b",
  wall: "#6eaa9b",
  wallDark: "#477c76",
  tile: "#e9c98e",
  tileAccent: "#c76654",
  wood: "#8f563e",
  woodLight: "#c47c4c",
  stoolRed: "#c76654",
  stoolBlue: "#5f7fa8",
  stoolGreen: "#769b68",
  plant: "#5d8b63",
  lamp: "#f7d36b",
} as const;

const SKIN_COLORS = {
  honey: PALETTE.skin,
  peach: "#e7a477",
  cocoa: "#a96f53",
  rose: "#d98f82",
  cream: "#f6cca2",
} as const;

const SHIRT_COLORS = {
  teal: PALETTE.shirt,
  tomato: "#c76654",
  blue: "#5f7fa8",
  leaf: "#769b68",
  plum: "#806b9b",
  yellow: "#d8a34f",
  coral: "#d88870",
  navy: "#4e6878",
} as const;

type CharacterRig = THREE.Group & {
  userData: {
    body: THREE.Group;
    head: THREE.Group;
    leftArm: THREE.Group;
    rightArm: THREE.Group;
    leftLeg: THREE.Group;
    rightLeg: THREE.Group;
    eyeLeft: THREE.Mesh;
    eyeRight: THREE.Mesh;
    shadow: THREE.Mesh;
    blinkTime: number;
    velocity: THREE.Vector2;
  };
};

export function startCafeGame(container: HTMLElement, playerName: string, callbacks: GameCallbacks): () => void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f6c98c");
  scene.fog = new THREE.Fog("#f6c98c", 18, 32);

  const camera = new THREE.OrthographicCamera(-9, 9, 6, -6, 0.1, 100);
  camera.position.set(12, 14, 14);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight("#fff4d6", PALETTE.wallDark, 2.2));
  const sun = new THREE.DirectionalLight("#fff5d6", 2.8);
  sun.position.set(-6, 12, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const colliders: THREE.Box3[] = [];
  addCafe(scene, colliders);
  const player = addPlayer(scene, playerName, undefined, callbacks.startPosition);
  const keys = new Set<string>();
  const input = new THREE.Vector2();
  const velocity = new THREE.Vector2();
  const remotePlayers = new Map<string, { rig: CharacterRig; target: THREE.Vector3; last: THREE.Vector3; chat?: THREE.Sprite; chatUntil: number }>();
  const previousPlayerPosition = player.position.clone();
  const visualPlayerPosition = player.position.clone();
  const cameraLookTarget = new THREE.Vector3();
  let joystickPointer: number | undefined;
  let animationFrame = 0;
  let previousTime = performance.now();
  let accumulator = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
      keys.add(key);
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.key.toLowerCase());
  };
  const clearKeys = () => keys.clear();
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearKeys);
  const onVisibilityChange = () => {
    if (document.hidden) {
      clearKeys();
      endJoystick();
    }
  };
  window.addEventListener("visibilitychange", onVisibilityChange);

  const joystick = document.querySelector<HTMLElement>("#joystick");
  const stick = document.querySelector<HTMLElement>("#joystick-stick");
  const onJoystickStart = (event: PointerEvent) => {
    joystickPointer = event.pointerId;
    joystick?.setPointerCapture(event.pointerId);
    updateJoystick(event);
  };
  const onJoystickMove = (event: PointerEvent) => {
    if (event.pointerId === joystickPointer) updateJoystick(event);
  };
  const onJoystickEnd = (event: PointerEvent) => {
    if (event.pointerId !== joystickPointer) return;
    endJoystick();
  };
  const endJoystick = () => {
    joystickPointer = undefined;
    input.set(0, 0);
    if (stick) stick.style.transform = "translate(-50%, -50%)";
  };
  const updateJoystick = (event: PointerEvent) => {
    if (!joystick) return;
    const bounds = joystick.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const maxDistance = bounds.width * 0.32;
    const vector = new THREE.Vector2(event.clientX - centerX, event.clientY - centerY);
    if (vector.length() > maxDistance) vector.setLength(maxDistance);
    const strength = vector.length() / maxDistance;
    const deadZone = MOVEMENT.joystickDeadZone;
    const adjustedStrength = strength <= deadZone ? 0 : (strength - deadZone) / (1 - deadZone);
    const curvedStrength = adjustedStrength * adjustedStrength;
    if (strength > 0) vector.setLength(curvedStrength);
    input.set(vector.x, -vector.y);
    if (stick) stick.style.transform = `translate(calc(-50% + ${vector.x}px), calc(-50% - ${vector.y}px))`;
  };
  joystick?.addEventListener("pointerdown", onJoystickStart);
  joystick?.addEventListener("pointermove", onJoystickMove);
  joystick?.addEventListener("pointerup", onJoystickEnd);
  joystick?.addEventListener("pointercancel", onJoystickEnd);
  window.addEventListener("pointerup", endJoystick);

  const resize = () => {
    const aspect = window.innerWidth / window.innerHeight;
    const viewHeight = 13;
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", resize);
  resize();

  const tick = (time: number) => {
    const delta = Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    accumulator = Math.min(accumulator + delta, 0.25);
    const movement = new THREE.Vector2(
      (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
      (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0),
    );
    movement.add(input);
    if (movement.lengthSq() > 1) movement.normalize();
    while (accumulator >= MOVEMENT.fixedStep) {
      previousPlayerPosition.copy(player.position);
      updateMovement(player, movement, velocity, MOVEMENT.fixedStep, colliders);
      accumulator -= MOVEMENT.fixedStep;
    }
    const renderAlpha = accumulator / MOVEMENT.fixedStep;
    visualPlayerPosition.lerpVectors(previousPlayerPosition, player.position, renderAlpha);
    const cameraAlpha = 1 - Math.exp(-MOVEMENT.cameraSharpness * delta);
    const lookAheadX = velocity.x * 0.18;
    const lookAheadZ = -velocity.y * 0.18;
    const targetCameraX = visualPlayerPosition.x + 12 + lookAheadX;
    const targetCameraZ = visualPlayerPosition.z + 14 + lookAheadZ;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCameraX, cameraAlpha);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCameraZ, cameraAlpha);
    cameraLookTarget.set(
      visualPlayerPosition.x + lookAheadX,
      0,
      visualPlayerPosition.z + lookAheadZ,
    );
    camera.lookAt(cameraLookTarget);
    animatePlayer(player, velocity.length() / MOVEMENT.maxSpeed, time / 1000);
    callbacks.onPosition?.(player.position.x, player.position.z, velocity.x, velocity.y);
    for (const remote of remotePlayers.values()) {
      remote.last.lerp(remote.target, 1 - Math.exp(-14 * delta));
      remote.rig.position.lerp(remote.last, 1);
      animatePlayer(remote.rig, remote.rig.userData.velocity.length() / MOVEMENT.maxSpeed, time / 1000);
      if (remote.chat && time > remote.chatUntil) {
        remote.rig.remove(remote.chat);
        remote.chat = undefined;
      }
    }
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
  callbacks.onRemoteReady?.({ addRemotePlayer, removeRemotePlayer, showRemoteChat, playRemoteEmote });

  return () => {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", clearKeys);
    window.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pointerup", endJoystick);
    window.removeEventListener("resize", resize);
    joystick?.removeEventListener("pointerdown", onJoystickStart);
    joystick?.removeEventListener("pointermove", onJoystickMove);
    joystick?.removeEventListener("pointerup", onJoystickEnd);
    joystick?.removeEventListener("pointercancel", onJoystickEnd);
    renderer.dispose();
    renderer.domElement.remove();
    callbacks.onExit();
  };

  function addRemotePlayer(state: PlayerState): void {
    const existing = remotePlayers.get(state.id);
    if (existing) {
      existing.target.set(state.x, 0, state.z);
      existing.rig.userData.velocity.set(state.vx, -state.vz);
      return;
    }
    const rig = addPlayer(scene, state.name, state.config);
    rig.position.set(state.x, 0, state.z);
    rig.userData.velocity.set(state.vx, -state.vz);
    const remote = { rig, target: rig.position.clone(), last: rig.position.clone(), chatUntil: 0 };
    remotePlayers.set(state.id, remote);
  }

  function removeRemotePlayer(playerId: string): void {
    const remote = remotePlayers.get(playerId);
    if (!remote) return;
    scene.remove(remote.rig);
    remotePlayers.delete(playerId);
  }

  function showRemoteChat(playerId: string, text: string): void {
    const remote = remotePlayers.get(playerId);
    if (!remote) return;
    if (remote.chat) remote.rig.remove(remote.chat);
    const chat = makeChatLabel(text);
    chat.position.set(0, 3.25, 0);
    remote.chat = chat;
    remote.rig.add(chat);
    remote.chatUntil = performance.now() + 3500;
  }

  function playRemoteEmote(playerId: string, emote: "wave" | "jump" | "cheers"): void {
    const remote = remotePlayers.get(playerId);
    if (!remote) return;
    const amount = emote === "jump" ? 0.35 : 0.15;
    remote.rig.position.y = amount;
    window.setTimeout(() => {
      remote.rig.position.y = 0;
    }, 260);
  }

}

function addCafe(scene: THREE.Scene, colliders: THREE.Box3[]): void {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_WIDTH, 0.2, ROOM_DEPTH),
    new THREE.MeshStandardMaterial({ map: makeTileTexture(), roughness: 0.9 }),
  );
  floor.position.y = -0.1;
  scene.add(floor);
  addWall(scene, colliders, 0, 1.5, -ROOM_DEPTH / 2, ROOM_WIDTH, 3, 0.3, PALETTE.wall);
  addWall(scene, colliders, -ROOM_WIDTH / 2, 1.5, 0, 0.3, 3, ROOM_DEPTH, PALETTE.wall);
  addWall(scene, colliders, ROOM_WIDTH / 2, 1.5, 0, 0.3, 3, ROOM_DEPTH, PALETTE.wall);
  addWall(scene, colliders, 0, 1.5, ROOM_DEPTH / 2, ROOM_WIDTH, 3, 0.3, PALETTE.wall);
  addBlock(scene, colliders, 0, 0.42, -ROOM_DEPTH / 2 + 0.18, ROOM_WIDTH, 0.7, 0.18, PALETTE.wallDark);
  addFacade(scene);
  addStreetSet(scene);
  addPlants(scene);
  addStringLights(scene);
  addMenuBoard(scene);
  addClock(scene);
  addCat(scene);

  addFurniture(scene, colliders);
  const fan = new THREE.Group();
  fan.position.set(0, 4.5, 0);
  fan.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), PALETTE.hair));
  for (let index = 0; index < 4; index += 1) {
    const blade = mesh(new THREE.BoxGeometry(0.16, 0.04, 1.6), PALETTE.tile);
    blade.rotation.y = (index * Math.PI) / 2;
    blade.position.z = 0.75;
    fan.add(blade);
  }
  scene.add(fan);
}

function makeTileTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = PALETTE.tile;
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = PALETTE.tileAccent;
  context.lineWidth = 5;
  context.strokeRect(4, 4, 120, 120);
  context.beginPath();
  context.moveTo(64, 8);
  context.lineTo(120, 64);
  context.lineTo(64, 120);
  context.lineTo(8, 64);
  context.closePath();
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 5);
  return texture;
}

function addFacade(scene: THREE.Scene): void {
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(6.6, 1.15, 0.18),
    new THREE.MeshStandardMaterial({ map: makeSignTexture("QUÁN CÀ PHÊ NHÀ MÌNH"), emissive: PALETTE.lamp, emissiveIntensity: 0.18 }),
  );
  sign.position.set(0, 3.25, -5.72);
  sign.castShadow = true;
  scene.add(sign);
  const awning = mesh(new THREE.BoxGeometry(8, 0.22, 1.15), PALETTE.tileAccent);
  awning.position.set(0, 2.45, -5.35);
  awning.rotation.x = -0.18;
  scene.add(awning);
  const trim = mesh(new THREE.BoxGeometry(8.2, 0.12, 0.12), PALETTE.lamp);
  trim.position.set(0, 2.45, -5.88);
  scene.add(trim);
}

function makeSignTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = PALETTE.wood;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = PALETTE.lamp;
    context.font = "bold 42px system-ui";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addStreetSet(scene: THREE.Scene): void {
  const street = mesh(new THREE.BoxGeometry(ROOM_WIDTH + 8, 0.12, 2.5), PALETTE.wallDark);
  street.position.set(0, -0.16, -7.1);
  scene.add(street);
  addScooter(scene, -6.4, -7.1, PALETTE.stoolRed);
  addScooter(scene, 6.3, -7.1, PALETTE.stoolBlue);
  const pole = new THREE.Group();
  pole.position.set(7.5, 1.8, -6.45);
  pole.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 8), PALETTE.hair));
  const lamp = mesh(new THREE.SphereGeometry(0.24, 8, 6), PALETTE.lamp);
  lamp.position.y = 1.7;
  const lampMaterial = lamp.material as THREE.MeshStandardMaterial;
  lampMaterial.emissive = new THREE.Color(PALETTE.lamp);
  lampMaterial.emissiveIntensity = 0.8;
  pole.add(lamp);
  scene.add(pole);
}

function addScooter(scene: THREE.Scene, x: number, z: number, color: string): void {
  const scooter = new THREE.Group();
  scooter.position.set(x, 0.25, z);
  const wheelGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.hair });
  for (const wheelX of [-0.55, 0.55]) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.x = wheelX;
    scooter.add(wheel);
  }
  const body = mesh(new THREE.BoxGeometry(1.15, 0.32, 0.45), color);
  body.position.y = 0.35;
  scooter.add(body);
  const handle = mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), PALETTE.hair);
  handle.position.set(0.55, 0.7, 0);
  handle.rotation.z = -0.25;
  scooter.add(handle);
  scene.add(scooter);
}

function addPlants(scene: THREE.Scene): void {
  const potGeometry = new THREE.CylinderGeometry(0.28, 0.22, 0.4, 8);
  const potMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.woodLight });
  const leafGeometry = new THREE.SphereGeometry(0.3, 7, 5);
  const leafMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.plant });
  const plants = new THREE.InstancedMesh(leafGeometry, leafMaterial, 6);
  const transform = new THREE.Object3D();
  for (let index = 0; index < 6; index += 1) {
    transform.position.set(-7.3 + index * 0.65, 2.8 + (index % 2) * 0.18, -5.72);
    transform.scale.setScalar(0.75 + (index % 3) * 0.12);
    transform.updateMatrix();
    plants.setMatrixAt(index, transform.matrix);
  }
  plants.instanceMatrix.needsUpdate = true;
  scene.add(plants);
  for (const x of [-7.3, 7.3]) {
    const pot = new THREE.Mesh(potGeometry, potMaterial);
    pot.position.set(x, 0.2, -4.9);
    scene.add(pot);
  }
}

function addStringLights(scene: THREE.Scene): void {
  const bulbGeometry = new THREE.SphereGeometry(0.1, 8, 6);
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.lamp,
    emissive: PALETTE.lamp,
    emissiveIntensity: 0.6,
  });
  const bulbs = new THREE.InstancedMesh(bulbGeometry, bulbMaterial, 10);
  const transform = new THREE.Object3D();
  for (let index = 0; index < 10; index += 1) {
    transform.position.set(-7.5 + index * 1.65, 2.8 + Math.sin(index) * 0.12, -5.52);
    transform.updateMatrix();
    bulbs.setMatrixAt(index, transform.matrix);
  }
  bulbs.instanceMatrix.needsUpdate = true;
  scene.add(bulbs);
}

function addMenuBoard(scene: THREE.Scene): void {
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.5, 0.08),
    new THREE.MeshStandardMaterial({ map: makeSignTexture("HÔM NAY\nCÀ PHÊ"), roughness: 0.9 }),
  );
  board.position.set(4.2, 2, -5.72);
  board.rotation.y = Math.PI;
  scene.add(board);
}

function addClock(scene: THREE.Scene): void {
  const clock = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16), PALETTE.tile);
  clock.position.set(-3.2, 2.35, -5.72);
  clock.rotation.x = Math.PI / 2;
  scene.add(clock);
  const hand = mesh(new THREE.BoxGeometry(0.04, 0.35, 0.03), PALETTE.hair);
  hand.position.set(-3.2, 2.45, -5.8);
  scene.add(hand);
}

function addCat(scene: THREE.Scene): void {
  const cat = new THREE.Group();
  cat.position.set(6.6, 0.28, -3.1);
  const body = mesh(new THREE.SphereGeometry(0.38, 10, 7), PALETTE.hair);
  body.scale.set(1.35, 0.55, 0.8);
  cat.add(body);
  const head = mesh(new THREE.SphereGeometry(0.24, 10, 7), PALETTE.hair);
  head.position.set(0.42, 0.06, 0);
  cat.add(head);
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.09, 0.18, 4), PALETTE.hair);
    ear.position.set(0.43, 0.28, side * 0.13);
    cat.add(ear);
  }
  scene.add(cat);
}

function addFurniture(scene: THREE.Scene, colliders: THREE.Box3[]): void {
  addBlock(scene, colliders, -5.8, 1, -3.8, 5, 1.8, 1.3, PALETTE.wood);
  addBlock(scene, colliders, -5.8, 2, -3.8, 4.4, 0.4, 1.1, PALETTE.woodLight);
  addBlock(scene, colliders, 5.3, 1, -3.9, 1.2, 2, 1.2, PALETTE.wood);
  addBlock(scene, colliders, 5.3, 2.1, -3.9, 1.4, 0.25, 1.4, PALETTE.apron);
  for (const [x, z] of [[-2.5, 2.3], [2, 2.2], [-2.5, -0.9], [2, -0.8]]) {
    addTable(scene, colliders, x, z);
  }
  addBlock(scene, colliders, 0, 0.7, -4.8, 2.5, 1.1, 0.5, "#a96143");
  addBlock(scene, colliders, 0, 1.35, -4.8, 2.7, 0.25, 0.7, "#f1c276");
}

function addTable(scene: THREE.Scene, colliders: THREE.Box3[], x: number, z: number): void {
  const table = mesh(new THREE.CylinderGeometry(1, 1, 0.22, 12), "#c47c4c");
  table.position.set(x, 1, z);
  table.castShadow = true;
  scene.add(table);
  addBlock(scene, colliders, x, 0.45, z, 0.25, 0.9, 0.25, "#85513c");
  for (const [dx, dz] of [[1.35, 0], [-1.35, 0]]) {
    const chair = mesh(new THREE.BoxGeometry(0.7, 0.65, 0.7), [PALETTE.stoolRed, PALETTE.stoolBlue, PALETTE.stoolGreen][Math.abs(Math.round(x + z)) % 3]);
    chair.position.set(x + dx, 0.35, z + dz);
    chair.castShadow = true;
    scene.add(chair);
  }
  colliders.push(new THREE.Box3(new THREE.Vector3(x - 1.1, 0, z - 1.1), new THREE.Vector3(x + 1.1, 1.3, z + 1.1)));
}

function addWall(scene: THREE.Scene, colliders: THREE.Box3[], x: number, y: number, z: number, width: number, height: number, depth: number, color: string): void {
  addBlock(scene, colliders, x, y, z, width, height, depth, color);
}

function addBlock(scene: THREE.Scene, colliders: THREE.Box3[], x: number, y: number, z: number, width: number, height: number, depth: number, color: string): void {
  const object = mesh(new THREE.BoxGeometry(width, height, depth), color);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  scene.add(object);
  colliders.push(new THREE.Box3(new THREE.Vector3(x - width / 2, 0, z - depth / 2), new THREE.Vector3(x + width / 2, height + 0.1, z + depth / 2)));
}

function addPlayer(scene: THREE.Scene, name: string, config: CharacterConfig = {
  skin: "honey",
  shirt: "teal",
  hat: "conical",
  apron: true,
}, startPosition = { x: 0, z: 3.8 }): CharacterRig {
  const player = new THREE.Group() as CharacterRig;
  const body = new THREE.Group();
  body.position.y = 0.92;
  player.add(body);
  const shirt = mesh(new THREE.CapsuleGeometry(0.42, 0.62, 4, 8), SHIRT_COLORS[config.shirt]);
  shirt.castShadow = true;
  body.add(shirt);
  if (config.apron) {
    const apron = mesh(new THREE.BoxGeometry(0.55, 0.55, 0.06), PALETTE.apron);
    apron.position.set(0, -0.02, 0.39);
    apron.castShadow = true;
    body.add(apron);
  }

  const head = new THREE.Group();
  head.position.y = 1.72;
  player.add(head);
  const face = mesh(new THREE.SphereGeometry(0.48, 12, 8), SKIN_COLORS[config.skin]);
  face.scale.set(1, 1.05, 0.9);
  face.castShadow = true;
  head.add(face);
  const eyeGeometry = new THREE.SphereGeometry(0.055, 8, 6);
  const eyeLeft = mesh(eyeGeometry, PALETTE.eye);
  const eyeRight = mesh(eyeGeometry, PALETTE.eye);
  eyeLeft.position.set(-0.17, 0.05, 0.42);
  eyeRight.position.set(0.17, 0.05, 0.42);
  head.add(eyeLeft, eyeRight);
  for (const x of [-0.29, 0.29]) {
    const cheek = mesh(new THREE.SphereGeometry(0.075, 8, 6), PALETTE.blush);
    cheek.scale.set(1.3, 0.65, 0.4);
    cheek.position.set(x, -0.12, 0.42);
    head.add(cheek);
  }

  if (config.hat === "conical") {
    const hat = mesh(new THREE.ConeGeometry(0.6, 0.42, 8), PALETTE.hat);
    hat.position.y = 0.52;
    hat.rotation.x = Math.PI;
    head.add(hat);
  } else if (config.hat === "cap") {
    const cap = mesh(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), PALETTE.hat);
    cap.position.y = 0.38;
    head.add(cap);
  }

  const leftArm = addLimb(body, -0.53, 0.02, 0.22, SHIRT_COLORS[config.shirt]);
  const rightArm = addLimb(body, 0.53, 0.02, 0.22, SHIRT_COLORS[config.shirt]);
  const leftLeg = addLimb(player, -0.2, 0.34, -0.03, PALETTE.skinDark);
  const rightLeg = addLimb(player, 0.2, 0.34, -0.03, PALETTE.skinDark);
  const shadow = mesh(new THREE.CircleGeometry(0.62, 16), PALETTE.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.scale.set(1, 0.55, 1);
  const shadowMaterial = shadow.material as THREE.MeshStandardMaterial;
  shadowMaterial.transparent = true;
  shadowMaterial.opacity = 0.3;
  player.add(shadow);
  const marker = mesh(new THREE.RingGeometry(0.58, 0.68, 20), PALETTE.marker);
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.025;
  player.add(marker);
  const label = makeLabel(name);
  label.position.set(0, 2.75, 0);
  player.add(label);
  player.userData = {
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    eyeLeft,
    eyeRight,
    shadow,
    blinkTime: 0,
    velocity: new THREE.Vector2(),
  };
  player.position.set(startPosition.x, 0, startPosition.z);
  scene.add(player);
  return player;
}

function addLimb(parent: THREE.Object3D, x: number, y: number, z: number, color: string): THREE.Group {
  const limb = new THREE.Group();
  limb.position.set(x, y, z);
  const shape = mesh(new THREE.CapsuleGeometry(0.13, 0.42, 3, 6), color);
  shape.position.y = -0.28;
  shape.castShadow = true;
  limb.add(shape);
  parent.add(limb);
  return limb;
}

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.strokeStyle = "#fff4d6";
    context.lineWidth = 8;
    context.font = "bold 28px system-ui";
    context.textAlign = "center";
    context.strokeText(text.slice(0, 16), 128, 40);
    context.fillStyle = PALETTE.eye;
    context.fillText(text.slice(0, 16), 128, 40);
  }

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
  sprite.scale.set(2.2, 0.55, 1);
  return sprite;
}

function makeChatLabel(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#fffdf9";
    context.roundRect(4, 4, 376, 88, 18);
    context.fill();
    context.fillStyle = PALETTE.eye;
    context.font = "24px system-ui";
    context.textAlign = "center";
    context.fillText(text.slice(0, 60), 192, 58);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
  sprite.scale.set(2.4, 0.6, 1);
  return sprite;
}

function animatePlayer(player: CharacterRig, inputMagnitude: number, seconds: number): void {
  const { body, head, leftArm, rightArm, leftLeg, rightLeg, eyeLeft, eyeRight } = player.userData;
  const walking = Math.min(inputMagnitude, 1);
  const stride = seconds * 10;
  const swing = Math.sin(stride) * 0.55 * walking;
  body.position.y = 0.92 + Math.sin(seconds * 5) * 0.025 * walking;
  body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, -swing * 0.12, 0.15);
  leftLeg.rotation.x = swing;
  rightLeg.rotation.x = -swing;
  leftArm.rotation.x = -swing * 0.8;
  rightArm.rotation.x = swing * 0.8;
  head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, body.rotation.z * 0.5, 0.15);
  player.userData.blinkTime += 1 / 60;
  if (player.userData.blinkTime > 3.5) player.userData.blinkTime = -0.12;
  const blink = player.userData.blinkTime > 0 && player.userData.blinkTime < 0.12;
  eyeLeft.scale.y = blink ? 0.12 : 1;
  eyeRight.scale.y = blink ? 0.12 : 1;
}

function mesh(geometry: THREE.BufferGeometry, color: string): THREE.Mesh {
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
}

function updateMovement(
  player: CharacterRig,
  direction: THREE.Vector2,
  velocity: THREE.Vector2,
  delta: number,
  colliders: THREE.Box3[],
): void {
  const desired = direction.clone().multiplyScalar(MOVEMENT.maxSpeed);
  const rate = desired.lengthSq() > 0 ? MOVEMENT.acceleration : MOVEMENT.deceleration;
  const blend = Math.min(rate * delta, 1);
  velocity.lerp(desired, blend);
  moveWithCollisions(player, velocity, delta, colliders);
  if (velocity.lengthSq() > 0.01) {
    const targetRotation = Math.atan2(velocity.x, velocity.y);
    player.rotation.y = THREE.MathUtils.damp(player.rotation.y, targetRotation, MOVEMENT.turnSharpness, delta);
  }
}

function moveWithCollisions(player: THREE.Group, velocity: THREE.Vector2, delta: number, colliders: THREE.Box3[]): void {
  const next = player.position.clone();
  next.x += velocity.x * delta;
  next.x = THREE.MathUtils.clamp(next.x, -ROOM_WIDTH / 2 + PLAYER_RADIUS, ROOM_WIDTH / 2 - PLAYER_RADIUS);
  if (!isBlocked(next.x, next.z, colliders)) player.position.x = next.x;
  next.z -= velocity.y * delta;
  next.z = THREE.MathUtils.clamp(next.z, -ROOM_DEPTH / 2 + PLAYER_RADIUS, ROOM_DEPTH / 2 - PLAYER_RADIUS);
  if (!isBlocked(player.position.x, next.z, colliders)) player.position.z = next.z;
}

function isBlocked(x: number, z: number, colliders: THREE.Box3[]): boolean {
  const candidate = new THREE.Box3(
    new THREE.Vector3(x - PLAYER_RADIUS, 0, z - PLAYER_RADIUS),
    new THREE.Vector3(x + PLAYER_RADIUS, 2.4, z + PLAYER_RADIUS),
  );
  return colliders.some((collider) => collider.intersectsBox(candidate));
}
