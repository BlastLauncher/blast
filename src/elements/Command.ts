import BaseElement from "./BaseElement";
import { Container } from "../types";
import type { Server } from "rpc-websockets";

export default class Command extends BaseElement implements Container {
  constructor(props: Record<string, any> & { server?: Server } = {}) {
    super(props, { server: props.server });

    this.setupServer(props.server);
  }

  clear(): void {
    this.children = [];
  }

  get server() {
    return this.props.server;
  }

  setupServer(server?: Server) {
    if (!server) return;

    server.register("getTree", () => {
      return this.serialize();
    });
  }
}
