import { EventEmitter } from 'events'

// Server-side event bus used by API routes to notify the UI.
// Replaces the old DataStore(change events) without relying on data.json.
class ServerEvents extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(200)
  }
}

export const serverEvents = new ServerEvents()
