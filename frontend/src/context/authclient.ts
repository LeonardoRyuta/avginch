import { AuthClient } from "@dfinity/auth-client";
import { ActorSubclass, ActorMethod } from "@dfinity/agent";
import { createContext } from "react";
import { LedgerCanister } from "@dfinity/ledger-icp";

const AuthClientContext = createContext<{
    authClient: AuthClient | undefined;
    address: string;
    connect: (alreadyConnected?: boolean) => Promise<void>;
    disconnect: () => void;
    webapp: ActorSubclass<Record<string, ActorMethod<unknown[], unknown>>> | undefined;
    connected: boolean;
    connecting: boolean;
    ledgerCanister: LedgerCanister | undefined;
}>({
    authClient: undefined,
    address: "",
    connect: async () => { },
    disconnect: () => { },
    webapp: undefined,
    connected: false,
    connecting: true,
    ledgerCanister: undefined,
});

export { AuthClientContext };