import { AuthClient } from "@dfinity/auth-client";
import { ActorSubclass, ActorMethod } from "@dfinity/agent";
import { createContext } from "react";

const AuthClientContext = createContext<{
    authClient: AuthClient | undefined;
    address: string;
    connect: (alreadyConnected?: boolean) => Promise<void>;
    disconnect: () => void;
    webapp: ActorSubclass<Record<string, ActorMethod<unknown[], unknown>>> | undefined;
    connected: boolean;
    connecting: boolean;
}>({
    authClient: undefined,
    address: "",
    connect: async () => { },
    disconnect: () => { },
    webapp: undefined,
    connected: false,
    connecting: true,
});

export { AuthClientContext };