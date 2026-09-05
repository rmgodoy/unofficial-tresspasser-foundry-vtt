/** Map tracking pending damage amounts and debounced animation functions per token */
const _tokenDamageAnimState = new Map();

/**
 * Queue debounced damage animation for a token.
 * Batches multiple rapid damage calls into a single sum animation (shake + floating text).
 * @param {Token} token
 * @param {number} amount
 */
export function queueDamageAnimation(token, amount) {
  if (!token || (!token.mesh && !token.icon) || !amount) return;
  const tokenId = token.id;

  let state = _tokenDamageAnimState.get(tokenId);
  if (!state) {
    state = {
      pendingDamage: 0,
      debounceFn: null
    };
    state.debounceFn = foundry.utils.debounce(() => playDebouncedAnimation(token), 250);
    _tokenDamageAnimState.set(tokenId, state);
  }

  state.pendingDamage += amount;
  state.debounceFn();
}

/**
 * Plays the batched damage animation (shake + total scrolling text) for a token.
 * @param {Token} token
 */
export async function playDebouncedAnimation(token) {
  const tokenId = token?.id;
  if (!tokenId) return;

  const state = _tokenDamageAnimState.get(tokenId);
  if (!state || state.pendingDamage <= 0) return;

  const totalAmount = state.pendingDamage;
  state.pendingDamage = 0;

  // Wait for any active movement animation to complete first so damage animation occurs at final position
  if (token.animationContexts?.size > 0) {
    const promises = Array.from(token.animationContexts.values()).map(ctx => ctx.promise);
    await Promise.allSettled(promises);
  } else if (token._animation) {
    await token._animation;
  }

  animateDamageText(token, totalAmount);
  await animateTokenShake(token);
}

/**
 * Animate token shake on canvas when taking damage.
 * @param {Token} token
 */
export async function animateTokenShake(token) {
  if (!token || (!token.mesh && !token.icon)) return;

  if (token.animationContexts?.size > 0) {
    const promises = Array.from(token.animationContexts.values()).map(ctx => ctx.promise);
    await Promise.allSettled(promises);
  } else if (token._animation) {
    await token._animation;
  }

  const mesh = token.mesh || token.icon;
  mesh._shakeBaseX ??= mesh.x;
  const baseX = mesh._shakeBaseX;

  const keyframes = [
    { dx: -10, duration: 40 },
    { dx: 10, duration: 40 },
    { dx: -8, duration: 40 },
    { dx: 8, duration: 40 },
    { dx: -4, duration: 40 },
    { dx: 4, duration: 40 },
    { dx: 0, duration: 40 }
  ];

  for (const k of keyframes) {
    mesh.x = baseX + k.dx;
    await new Promise(r => setTimeout(r, k.duration));
  }
  mesh.x = baseX;
  delete mesh._shakeBaseX;
}

/**
 * Animate floating red damage text (scrolling combat text) over damaged token.
 * @param {Token} token
 * @param {number} amount
 */
export function animateDamageText(token, amount) {
  if (!token || !amount) return;
  const center = token.center || { x: token.x + canvas.grid.size / 2, y: token.y + canvas.grid.size / 2 };

  const textOptions = {
    anchorU: 0.5,
    anchorV: 0.5,
    direction: 1,
    duration: 1200,
    jitter: 0.25,
    fill: "#ff2a2a",
    stroke: "#000000",
    strokeThickness: 5,
    fontSize: 32,
    fontWeight: "bold"
  };

  if (canvas.interface?.createScrollingText) {
    canvas.interface.createScrollingText(center, `-${amount}`, textOptions);
  } else if (canvas.hud?.createScrollingText) {
    canvas.hud.createScrollingText(center, `-${amount}`, textOptions);
  }
}

/**
 * Animate floating green healing text (scrolling combat text) over healed token.
 * @param {Token} token
 * @param {number} amount
 */
export function animateHealingText(token, amount) {
  if (!token || !amount) return;
  const center = token.center || { x: token.x + canvas.grid.size / 2, y: token.y + canvas.grid.size / 2 };

  const textOptions = {
    anchorU: 0.5,
    anchorV: 0.5,
    direction: 1,
    duration: 1200,
    jitter: 0.25,
    fill: "#2ecc71",
    stroke: "#000000",
    strokeThickness: 5,
    fontSize: 32,
    fontWeight: "bold"
  };

  if (canvas.interface?.createScrollingText) {
    canvas.interface.createScrollingText(center, `+${amount}`, textOptions);
  } else if (canvas.hud?.createScrollingText) {
    canvas.hud.createScrollingText(center, `+${amount}`, textOptions);
  }
}
