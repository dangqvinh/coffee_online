import * as THREE from "three";

type GameCallbacks = {
  onExit: () => void;
};

const ROOM_WIDTH = 18;
const ROOM_DEPTH = 12;
const PLAYER_RADIUS = 0.38;
const MOVE_SPEED = 4;

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
} as const;

type CharacterConfig = {
  skin: keyof typeof SKIN_COLORS;
  shirt: keyof typeof SHIRT_COLORS;
  hat: "conical" | "cap" | "none";
  apron: boolean;
};

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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight("#fff4d6", "#9d684e", 2.2));
  const sun = new THREE.DirectionalLight("#fff5d6", 2.8);
  sun.position.set(-6, 12, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const colliders: THREE.Box3[] = [];
  addCafe(scene, colliders);
  const player = addPlayer(scene, playerName);
  const keys = new Set<string>();
  const input = new THREE.Vector2();
  let joystickPointer: number | undefined;
  let animationFrame = 0;
  let previousTime = performance.now();

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
    input.set(vector.x / maxDistance, -vector.y / maxDistance);
    if (stick) stick.style.transform = `translate(calc(-50% + ${vector.x}px), calc(-50% - ${vector.y}px))`;
  };
  joystick?.addEventListener("pointerdown", onJoystickStart);
  joystick?.addEventListener("pointermove", onJoystickMove);
  joystick?.addEventListener("pointerup", onJoystickEnd);
  joystick?.addEventListener("pointercancel", onJoystickEnd);

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
    const movement = new THREE.Vector2(
      (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
      (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0),
    );
    movement.add(input);
    if (movement.lengthSq() > 1) movement.normalize();
    moveWithCollisions(player, movement, delta, colliders);
    animatePlayer(player, movement.length(), time / 1000);
    camera.position.x = player.position.x + 12;
    camera.position.z = player.position.z + 14;
    camera.lookAt(player.position.x, 0, player.position.z);
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", clearKeys);
    window.removeEventListener("resize", resize);
    joystick?.removeEventListener("pointerdown", onJoystickStart);
    joystick?.removeEventListener("pointermove", onJoystickMove);
    joystick?.removeEventListener("pointerup", onJoystickEnd);
    joystick?.removeEventListener("pointercancel", onJoystickEnd);
    renderer.dispose();
    renderer.domElement.remove();
    callbacks.onExit();
  };
}

function addCafe(scene: THREE.Scene, colliders: THREE.Box3[]): void {
  const floor = mesh(new THREE.BoxGeometry(ROOM_WIDTH, 0.2, ROOM_DEPTH), "#d8a56a");
  floor.position.y = -0.1;
  scene.add(floor);
  addWall(scene, colliders, 0, 1.5, -ROOM_DEPTH / 2, ROOM_WIDTH, 3, 0.3);
  addWall(scene, colliders, -ROOM_WIDTH / 2, 1.5, 0, 0.3, 3, ROOM_DEPTH);
  addWall(scene, colliders, ROOM_WIDTH / 2, 1.5, 0, 0.3, 3, ROOM_DEPTH);
  addWall(scene, colliders, 0, 1.5, ROOM_DEPTH / 2, ROOM_WIDTH, 3, 0.3);

  addFurniture(scene, colliders);
  const fan = new THREE.Group();
  fan.position.set(0, 4.5, 0);
  fan.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), "#59443b"));
  for (let index = 0; index < 4; index += 1) {
    const blade = mesh(new THREE.BoxGeometry(0.16, 0.04, 1.6), "#fff0c7");
    blade.rotation.y = (index * Math.PI) / 2;
    blade.position.z = 0.75;
    fan.add(blade);
  }
  scene.add(fan);
}

function addFurniture(scene: THREE.Scene, colliders: THREE.Box3[]): void {
  addBlock(scene, colliders, -5.8, 1, -3.8, 5, 1.8, 1.3, "#9a593d");
  addBlock(scene, colliders, -5.8, 2, -3.8, 4.4, 0.4, 1.1, "#e1a15e");
  addBlock(scene, colliders, 5.3, 1, -3.9, 1.2, 2, 1.2, "#7b5140");
  addBlock(scene, colliders, 5.3, 2.1, -3.9, 1.4, 0.25, 1.4, "#e8b56e");
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
    const chair = mesh(new THREE.BoxGeometry(0.7, 0.65, 0.7), "#6f9b86");
    chair.position.set(x + dx, 0.35, z + dz);
    chair.castShadow = true;
    scene.add(chair);
  }
  colliders.push(new THREE.Box3(new THREE.Vector3(x - 1.1, 0, z - 1.1), new THREE.Vector3(x + 1.1, 1.3, z + 1.1)));
}

function addWall(scene: THREE.Scene, colliders: THREE.Box3[], x: number, y: number, z: number, width: number, height: number, depth: number): void {
  addBlock(scene, colliders, x, y, z, width, height, depth, "#f4d6a2");
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
}): CharacterRig {
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
  player.userData = { body, head, leftArm, rightArm, leftLeg, rightLeg, eyeLeft, eyeRight, shadow, blinkTime: 0 };
  player.position.set(0, 0, 3.8);
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

function moveWithCollisions(player: THREE.Group, direction: THREE.Vector2, delta: number, colliders: THREE.Box3[]): void {
  const distance = MOVE_SPEED * delta;
  const next = new THREE.Vector3(player.position.x + direction.x * distance, 0, player.position.z - direction.y * distance);
  next.x = THREE.MathUtils.clamp(next.x, -ROOM_WIDTH / 2 + PLAYER_RADIUS, ROOM_WIDTH / 2 - PLAYER_RADIUS);
  next.z = THREE.MathUtils.clamp(next.z, -ROOM_DEPTH / 2 + PLAYER_RADIUS, ROOM_DEPTH / 2 - PLAYER_RADIUS);
  const candidate = new THREE.Box3(
    new THREE.Vector3(next.x - PLAYER_RADIUS, 0, next.z - PLAYER_RADIUS),
    new THREE.Vector3(next.x + PLAYER_RADIUS, 2.4, next.z + PLAYER_RADIUS),
  );
  if (!colliders.some((collider) => collider.intersectsBox(candidate))) {
    player.position.copy(next);
  }
  if (direction.lengthSq() > 0) player.rotation.y = Math.atan2(direction.x, direction.y);
}
