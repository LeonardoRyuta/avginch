// import { AuthClientContext, DataContext } from "../utils";
import { AuthClient } from "@dfinity/auth-client";
import { HttpAgent, Actor, ActorSubclass, ActorMethod } from "@dfinity/agent";
import { idlFactory } from "../../../icp/src/declarations/icp_backend";
import { useEffect, useState } from "react";
import { AuthClientContext } from "../context/authclient";
import { LedgerCanister } from "@dfinity/ledger-icp";
import { Principal } from "@dfinity/principal";
// import { FAI3_backend } from "../../../declarations/FAI3_backend";

export default function Providers({ children }: { children: React.ReactNode }) {
    const [webapp, setWebApp] = useState<ActorSubclass<Record<string, ActorMethod<unknown[], unknown>>> | undefined>();
    const [address, setAddress] = useState<string>("");
    const [authClient, setAuthClient] = useState<AuthClient | undefined>(undefined);
    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(true);
    const [ledgerCanister, setLedgerCanister] = useState<LedgerCanister | undefined>(undefined);

    useEffect(() => {
        (async () => {
            if (!authClient) {
                setAuthClient(await AuthClient.create());
            }
        })();
    }, []);

    useEffect(() => {
        if (authClient) {
            (async () => {
                if (await authClient.isAuthenticated()) {
                    connect(true);
                    return;
                }
                setConnecting(false);
            })();
        }
    }, [authClient]);

    let iiUrl: string;
    if (import.meta.env.VITE_DFX_NETWORK === "local") {
        iiUrl = `http://${import.meta.env.VITE_CANISTER_ID_INTERNET_IDENTITY}.localhost:8080/`;
    } else if (import.meta.env.VITE_DFX_NETWORK === "ic") {
        iiUrl = `https://${import.meta.env.VITE_CANISTER_ID_INTERNET_IDENTITY}.ic0.app`;
    } else {
        iiUrl = `https://${import.meta.env.VITE_CANISTER_ID_INTERNET_IDENTITY}.dfinity.network`;
    }

    const connect = async (alreadyConnected = false) => {
        if (!authClient) return;
        setConnecting(true);

        if (!alreadyConnected) {
            await new Promise((resolve, reject) => {
                authClient.login({
                    identityProvider: iiUrl,
                    onSuccess: resolve,
                    onError: reject,
                    maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1000 * 1000 * 1000),
                });
            }).catch((err) => {
                console.error(err);
                setConnecting(false);
                return;
            });
        }

        setAddress(authClient.getIdentity().getPrincipal().toText());
        const identity = authClient.getIdentity();
        // const agent = await HttpAgent.create({
        //   identity,
        // });

        const agent = new HttpAgent({ identity, host: "http://127.0.0.1:8080" });

        agent.fetchRootKey().catch((err) => {
            console.log("Unable to fetch root key. Is the replica running?");
            console.error(err);
        });

        const webapp = Actor.createActor(idlFactory, {
            agent,
            canisterId: "uzt4z-lp777-77774-qaabq-cai",
        });
        
        const ledgerCanister = LedgerCanister.create({
            agent,
            canisterId: Principal.fromText(import.meta.env.VITE_CANISTER_ID_ICP_LEDGER_CANISTER || "ryjl3-tyaaa-aaaaa-aaaba-cai"),
        });

        setLedgerCanister(ledgerCanister);
        setWebApp(webapp);
        setConnected(true);
        setConnecting(false);
    };

    const disconnect = () => {
        if (!authClient) return;

        authClient.logout();
        setAddress("");
        setWebApp(undefined);
        setConnected(false);
    };

    return (
        <AuthClientContext.Provider value={{ authClient, address, connect, disconnect, webapp, connected, connecting, ledgerCanister }}>
            {children}
        </AuthClientContext.Provider>
    );
}