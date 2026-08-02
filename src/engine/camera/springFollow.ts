/**
 * Damped-spring smoothing, kept free of three.js so the easing can be checked
 * directly.
 *
 * The predecessor project eased the camera by closing a fixed fraction of the
 * remaining gap each frame. That is simple and wrong in a specific way: the
 * fraction is per frame rather than per second, so the camera lags further
 * behind at thirty frames a second than at sixty, and the feel of the game
 * changes with the hardware. The closed-form solution below is exact for any
 * timestep, so a slow frame produces the same trajectory as several fast ones.
 */

export interface Spring {
  value: number;
  velocity: number;
}

export function createSpring(value = 0): Spring {
  return { value, velocity: 0 };
}

/** Natural frequency, in radians per second, for a given stiffness. */
export function omegaFromStiffness(stiffness: number): number {
  return Math.sqrt(stiffness);
}

/**
 * Advance a spring toward `target`.
 *
 * A damping ratio of exactly 1 is critical damping: the fastest approach that
 * never overshoots, which is what a camera wants — overshoot reads as the
 * camera being knocked rather than following. Ratios below 1 overshoot and
 * oscillate; above 1 approach more slowly without overshooting.
 *
 * Mutates `spring` and allocates nothing.
 */
export function stepSpring(
  spring: Spring,
  target: number,
  omega: number,
  dampingRatio: number,
  dt: number,
): void {
  if (dt <= 0 || omega <= 0) return;

  const displacement = spring.value - target;
  const velocity = spring.velocity;

  if (Math.abs(dampingRatio - 1) < 1e-6) {
    // Critically damped: x(t) = (A + Bt)e^(-wt)
    const decay = Math.exp(-omega * dt);
    const b = velocity + omega * displacement;
    spring.value = target + (displacement + b * dt) * decay;
    spring.velocity = (velocity - b * omega * dt) * decay;
    return;
  }

  if (dampingRatio < 1) {
    // Underdamped: oscillates within a decaying envelope.
    const damped = omega * Math.sqrt(1 - dampingRatio * dampingRatio);
    const decay = Math.exp(-dampingRatio * omega * dt);
    const cos = Math.cos(damped * dt);
    const sin = Math.sin(damped * dt);
    const c = (velocity + dampingRatio * omega * displacement) / damped;
    spring.value = target + decay * (displacement * cos + c * sin);
    spring.velocity =
      decay *
      (velocity * cos -
        (displacement * omega * omega + dampingRatio * omega * velocity) * (sin / damped));
    return;
  }

  // Overdamped: two real exponentials, no oscillation.
  const root = omega * Math.sqrt(dampingRatio * dampingRatio - 1);
  const fast = -dampingRatio * omega - root;
  const slow = -dampingRatio * omega + root;
  const coeffB = (velocity - fast * displacement) / (slow - fast);
  const coeffA = displacement - coeffB;
  const expFast = Math.exp(fast * dt);
  const expSlow = Math.exp(slow * dt);
  spring.value = target + coeffA * expFast + coeffB * expSlow;
  spring.velocity = coeffA * fast * expFast + coeffB * slow * expSlow;
}
