import "server-only";

export type DeliveryResult = {
  status: "simulated" | "not_sent";
  providerMessageId: null;
};

/** Development pretends messages are delivered so the inbox can be tried end to end. */
const simulatorOn = () => process.env.NODE_ENV === "development";

/** No platform is connected yet: messages stay "not sent" for staff to send from the app; real connectors plug in here. */
export async function deliver(): Promise<DeliveryResult> {
  return {
    status: simulatorOn() ? "simulated" : "not_sent",
    providerMessageId: null,
  };
}

export const isSimulatorOn = simulatorOn;
