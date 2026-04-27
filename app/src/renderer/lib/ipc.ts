// Typed accessor for window.api exposed by the preload script.
// Importing this in renderer code gives full type safety without importing electron.

import type { Api } from '../../preload/index'

declare global {
  interface Window {
    api: Api
  }
}

export const api = window.api
