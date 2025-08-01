import { Principal } from "@dfinity/principal";
import { AccountIdentifier, LedgerCanister } from "@dfinity/ledger-icp";
import { ActorMethod, ActorSubclass } from "@dfinity/agent";

const depositToCanister = async (ledgerCanister: LedgerCanister, amount: number) => {
    await ledgerCanister?.transfer({
        to: AccountIdentifier.fromPrincipal({ principal: Principal.fromText("uzt4z-lp777-77774-qaabq-cai") }),
        amount: BigInt(amount * 1000000), // Convert to smallest unit (ICP to satoshis)
    }).then((e) => {
        console.log('Deposit successful:', e);
        return true;
    }).catch((error) => {
        console.error('Deposit failed:', error);
        return false;
    })

    return true;
}

const createEscrow = async (webapp: ActorSubclass<Record<string, ActorMethod<unknown[], unknown>>> | undefined, type: string, maker: string, taker: string, token: string, amount: number) => {
    const args = {
        maker, //"qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae",
        taker, //address,
        token, // "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount: BigInt(amount * 1000000), //10000000,
        safety_deposit: 150000,
        hashlock: [253, 127, 201, 127, 180, 15, 64, 246, 188, 16, 43, 118, 249, 252, 107, 120, 162, 193, 72, 123, 17, 190, 186, 158, 105, 232, 145, 51, 52, 104, 201, 102],
        order_hash: [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
            17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 33, 31, 32
        ],
        timelocks: {
            deployed_at: 0,
            withdrawal: 3600,
            public_withdrawal: 7200,
            cancellation: 86400
        }
    };

    if (!webapp) {
        console.error("Webapp actor is not defined");
        return false;
    }

    if (type === 'src') {
        await webapp.create_src_escrow(args).then((e) => {
            console.log('Swap successful:', e);
        }).catch((error) => {
            console.error('Swap failed:', error);
            return false;
        });
    } else if (type === 'dst') {
        await webapp.create_dst_escrow(args).then((e) => {
            console.log('Swap successful:', e);
        }).catch((error) => {
            console.error('Swap failed:', error);
            return false;
        });
    }

    return true;
}


export {
    depositToCanister,
    createEscrow
}