/**
 * Public surface of the engine layer.
 *
 * Nothing in here may import from ../game, ../ui, ../net or ../assets - that
 * rule is enforced by `import/no-restricted-paths` in eslint.config.js. The
 * engine is meant to be liftable into a second project without edits.
 */
export * from './core/index.js';
export * from './render/index.js';
export * from './camera/index.js';
export * from './scene/index.js';
export * from './input/index.js';
export * from './audio/index.js';
export * from './physics/index.js';
export * from './debug/index.js';
