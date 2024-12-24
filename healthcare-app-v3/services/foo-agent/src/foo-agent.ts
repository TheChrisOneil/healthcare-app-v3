import { connect, NatsConnection, Msg, StringCodec } from "nats";

// Define interfaces for Foo events
interface FooInputEvent {
  data: string;
  metadata: Record<string, any>;
}

interface FooOutputEvent {
  original: FooInputEvent;
  processedAt: string;
  additionalInfo: string;
}

// Main class for the Foo Agent
class FooAgent {
  private nc: NatsConnection | undefined; // Initialize as undefined

  constructor() {
    this.init();
  }

  private async init() {
    this.nc = await this.initNATS(); // Retry mechanism for NATS connection
    console.log("Successfully initialized NATS connection.");
    this.subscribeToEvents();
  }

  private async initNATS(): Promise<NatsConnection> {
    let retries = 5;
    while (retries > 0) {
      try {
        const nc = await connect({ servers: "nats://nats-server:4222" });
        console.log("Connected to NATS");
        return nc;
      } catch (error) {
        console.error("Failed to connect to NATS. Retrying...", error);
        retries--;
        await new Promise((res) => setTimeout(res, 5000)); // Wait 5 seconds before retrying
      }
    }
    throw new Error("Unable to connect to NATS after multiple attempts.");
  }

  private subscribeToEvents() {
    if (!this.nc) {
      console.error("NATS connection not established");
      return;
    }

    const sc = StringCodec();

    this.nc.subscribe("foo.event.input", {
      callback: (err: Error | null, msg: Msg) => {
        if (err) {
          console.error("Error receiving input event:", err);
          return;
        }

        const data = JSON.parse(sc.decode(msg.data)) as FooInputEvent;
        console.log("Received input event:", data);

        this.processAndPublishEvent(data);
      },
    });
  }

  private processAndPublishEvent(input: FooInputEvent) {
    if (!this.nc) {
      console.error("NATS connection not established");
      return;
    }

    const output: FooOutputEvent = {
      original: input,
      processedAt: new Date().toISOString(),
      additionalInfo: "Processed by FooAgent",
    };

    const sc = StringCodec();
    this.nc.publish("foo.event.output", sc.encode(JSON.stringify(output)));
    console.log("Published output event:", output);
  }
}

// Start the Foo Agent
new FooAgent();
