/**
 * Single sanctioned import point for DI decorators. Re-exported from
 * inversify so classes never import the container library directly.
 *
 * Parameter decorators carry explicit service-identifier tokens (`@inject`)
 * because tsx/vitest compile through esbuild, which does not emit the
 * `emitDecoratorMetadata` reflection the token-less form relies on.
 */
export { decorate, inject, injectable, multiInject } from 'inversify'
