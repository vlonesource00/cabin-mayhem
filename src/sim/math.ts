import type { Vec2 } from './types';

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const length = (value: Vec2): number => Math.hypot(value.x, value.y);

export const distance = (a: Vec2, b: Vec2): number => length({ x: a.x - b.x, y: a.y - b.y });

export const normalized = (value: Vec2): Vec2 => {
  const magnitude = length(value);
  return magnitude > 0.0001 ? { x: value.x / magnitude, y: value.y / magnitude } : { x: 0, y: 0 };
};

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const scale = (value: Vec2, amount: number): Vec2 => ({
  x: value.x * amount,
  y: value.y * amount,
});

export const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
