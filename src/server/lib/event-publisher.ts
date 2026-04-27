import { buildEvent, type CoreEventName, type DomainEventMap } from "../../contracts/events";
import type { AuthContext } from "./auth-context";

export interface EventPublisher {
  publish<N extends CoreEventName>(eventName: N, payload: DomainEventMap[N], context: AuthContext): Promise<void>;
}

export class ConsoleEventPublisher implements EventPublisher {
  async publish<N extends CoreEventName>(
    eventName: N,
    payload: DomainEventMap[N],
    context: AuthContext,
  ): Promise<void> {
    const event = buildEvent({
      eventName,
      organizationId: context.organizationId ?? "",
      actorUserId: context.userId,
      context: payload,
    });

    // Replace with DB insert into event_log / queue publish in production.
    // This stub keeps API handlers deterministic while backend infrastructure is wired.
    console.log("[event]", JSON.stringify(event));
  }
}
