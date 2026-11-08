import * as THREE from "three";

type GameCallbacks = {
  onExit: () => void;
};

const ROOM_WIDTH = 18;
const ROOM_DEPTH = 12;
const PLAYER_RADIUS = 0.38;
const MOVE_SPEED = 4;

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
    keys.add(event.key.toLowerCase());
  };
  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.key.toLowerCase());
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

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

function addPlayer(scene: THREE.Scene, name: string): THREE.Group {
  const player = new THREE.Group();
  const shirt = mesh(new THREE.CapsuleGeometry(0.42, 0.7, 4, 8), "#5b8f82");
  shirt.position.y = 0.9;
  shirt.castShadow = true;
  player.add(shirt);
  const head = mesh(new THREE.SphereGeometry(0.42, 12, 8), "#f2bd88");
  head.position.y = 1.75;
  head.castShadow = true;
  player.add(head);
  const hat = mesh(new THREE.ConeGeometry(0.48, 0.35, 8), "#bd6b39");
  hat.position.y = 2.25;
  hat.castShadow = true;
  player.add(hat);
  const label = makeLabel(name);
  label.position.set(0, 2.9, 0);
  player.add(label);
  player.position.set(0, 0, 3.8);
  scene.add(player);
  return player;
}

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#3d2c22";
    context.font = "bold 28px system-ui";
    context.textAlign = "center";
    context.fillText(text.slice(0, 16), 128, 40);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
  sprite.scale.set(2.2, 0.55, 1);
  return sprite;
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
