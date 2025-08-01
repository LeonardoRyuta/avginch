import useAuthClient from "../hooks/useAuthClient";
import { useEffect, useState } from "react";

export default function ConnectWallet() {
    const { authClient, address, connect, connected } = useAuthClient();
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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            alert("Address copied to clipboard!");
        }).catch((err) => {
            console.error("Failed to copy: ", err);
            setError("Failed to copy address to clipboard.");
        });
    };

    return (
        <div className="flex items-center space-x-4">
            {connected ? (
                <div className="text-sm text-gray-700" onClick={() =>copyToClipboard(address)}>
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