import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "ethers";

const ICPEscrowModule = buildModule("ICPEscrowModule", (m) => {
  // Deploy MockAccessToken first
  const mockAccessToken = m.contract("MockAccessToken", []);

  // Factory configuration parameters
  const owner = m.getAccount(0); // First account as owner
  const rescueDelaySrc = 86400 * 7; // 7 days in seconds (more realistic for mainnet)
  const rescueDelayDst = 86400 * 7; // 7 days in seconds  
  const creationFee = parseEther("0.001"); // 0.001 ETH creation fee (reasonable for Base)
  const treasury = owner; // Use owner as treasury for now

  // ICP configuration - adjusted for real usage
  const icpConfig = {
    minConfirmations: 1, // Faster for testnet
    dustThreshold: 1000, // 1000 e8s minimum (0.00001 ICP)
    maxAmount: parseEther("1000") // 1000 ETH equivalent maximum
  };

  // Deploy ICPEscrowFactory
  const icpEscrowFactory = m.contract("ICPEscrowFactory", [
    mockAccessToken,
    owner,
    rescueDelaySrc,
    rescueDelayDst,
    creationFee,
    treasury,
    icpConfig
  ]);

  return {
    mockAccessToken,
    icpEscrowFactory,
  };
});

export default ICPEscrowModule;
