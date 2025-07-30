import useAuthClient from "../hooks/useAuthClient";
import { useEffect, useState } from "react";

export default function ConnectWallet() {
    const { authClient, address, connect, connecting, connected, webapp } = useAuthClient();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (authClient) {
            (async () => {
                if (await authClient.isAuthenticated()) {
                    connect(true);
                }
            })();
        }
    }, [authClient]);

    const testConnection = async () => {
        if (!webapp) return;
        await webapp.greet("Hello from ConnectWallet!").then((response) => {
            console.log("Response from greet:", response);
        }).catch((err) => {
            console.error("Error calling greet:", err);
            setError("Failed to call greet method.");
        });
    };

    return (
        <div className="flex items-center space-x-4">
            {connected ? (
                <div className="text-sm text-gray-700">
                    <button className="btn-secondary text-sm px-4 py-2 font-medium" onClick={testConnection} disabled={connecting}>
                        Test Connection
                    </button>
                    Connected as <span className="font-semibold">{address.substring(0, 6)}...{address.substring(address.length - 4)}</span>
                </div>
            ) : (
                <div>
                    <button className="btn-secondary text-sm px-6 py-2 font-medium" onClick={() => connect()} disabled={authClient === undefined || !authClient.isAuthenticated()}>
                        Connect Wallet
                    </button>
                </div>
            )}

            {error && <p className="error">{error}</p>}
        </div>
    );
}