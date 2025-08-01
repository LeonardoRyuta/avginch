import crypto from "crypto";
import { ethers } from "ethers";

function createSecret() {
  const secretBytes = crypto.randomBytes(32);
  const secret = "0x" + secretBytes.toString("hex");
  return secret;
}

function createHashlock(secret) {
  const hashlock = ethers.sha256(secret);
  return hashlock;
}

function secretHashlockFlow() {
  const secret = createSecret();
  const hashlock = createHashlock(secret);
  console.log("\n🔐 CRYPTOGRAPHIC SETUP:");
  console.log("=======================");
  console.log("🔑 Secret:", secret);
  console.log("🔒 Hashlock:", hashlock);
  return { secret, hashlock };
}

function formatHashlockForCandid(hashlock) {
  // Remove 0x prefix and convert hex to bytes
  const hex = hashlock.slice(2);
  const bytes = Buffer.from(hex, "hex");
  const byteArray = Array.from(bytes);

  return "{" + byteArray.join("; ") + "}";
}

function formatHashlockForAgent(hashlock) {
  // Remove 0x prefix and convert hex to bytes
  const hex = hashlock.slice(2);
  const bytes = Buffer.from(hex, "hex");
  const byteArray = Array.from(bytes);

  return "[" + byteArray.join(", ") + "]";
}

function formatSecretForCandid(secret) {
  // Remove 0x prefix and convert hex to bytes
  const hex = secret.slice(2);
  const bytes = Buffer.from(hex, "hex");
  const byteArray = Array.from(bytes);

  return "{" + byteArray.join(";") + "}";
}

function formatSecretForAgent(secret) {
  // Remove 0x prefix and convert hex to bytes
  const hex = secret.slice(2);
  const bytes = Buffer.from(hex, "hex");
  const byteArray = Array.from(bytes);

  return "[" + byteArray.join(",") + "]";
}

function printForCommandLine() {
  const { secret, hashlock } = secretHashlockFlow();

  console.log("\n📋 CANDID FORMAT FOR CLI:");
  console.log("==========================");
  console.log("Hashlock:", formatHashlockForCandid(hashlock));
  console.log("\n💾 SAVE THIS SECRET:", secret);
}

function printWithdrawalFormats(secret, hashlock) {
  console.log("\n🔓 WITHDRAWAL FORMATS:");
  console.log("======================");
  console.log("Secret for withdraw_src:", formatSecretForCandid(secret));
  console.log("Hashlock for withdraw_src:", formatHashlockForCandid(hashlock));

  console.log("\n🔐 WITHDRAWAL FORMAT FOR AGENT:");
  console.log("Secret for withdraw_src:", formatSecretForAgent(secret));
  console.log("Hashlock for withdraw_src:", formatHashlockForAgent(hashlock));

  console.log("\n📝 EXAMPLE WITHDRAW COMMAND:");
  console.log("============================");
  console.log(
    `dfx canister call icp_backend withdraw_src '(vec ${formatSecretForCandid(
      secret
    )}, vec ${formatHashlockForCandid(hashlock)})'`
  );
}

// For testing both creation and withdrawal
function printBothFormats() {
  const { secret, hashlock } = secretHashlockFlow();

  console.log("\n📋 CREATION FORMAT:");
  console.log("===================");
  console.log(
    "Hashlock for create_src_escrow:",
    formatHashlockForCandid(hashlock)
  );

  printWithdrawalFormats(secret, hashlock);
}

// If you already have a secret and want withdrawal format
function printWithdrawalOnly(existingSecret) {
  const hashlock = createHashlock(existingSecret);
  console.log("\n🔓 WITHDRAWAL FORMATS:");
  console.log("======================");
  console.log("Secret:", formatSecretForCandid(existingSecret));
  console.log("Hashlock:", formatHashlockForCandid(hashlock));

  console.log("\n📝 EXAMPLE WITHDRAW COMMAND:");
  console.log("============================");
  console.log(
    `dfx canister call icp_backend withdraw_src '(vec ${formatSecretForCandid(
      existingSecret
    )}, vec ${formatHashlockForCandid(hashlock)})'`
  );
}

// Run the main function
printBothFormats();

// Uncomment to test with existing secret:
// printWithdrawalOnly("0xe700e4d7e26770788c241b93e7a0250a0d19459d671d6fc0c406841262f852e0");

// 🔐 CRYPTOGRAPHIC SETUP:
// =======================
// 🔑 Secret: 0x33f3ca30fea6e47da9b0984d4817494f0320527ca841ad1ac017336df8937630
// 🔒 Hashlock: 0x22df37df88c410d2c552889f7405b848c6a5cb81bed5407665c72c2d232ab472

// 📋 CREATION FORMAT:
// ===================
// Hashlock for create_src_escrow: {34; 223; 55; 223; 136; 196; 16; 210; 197; 82; 136; 159; 116; 5; 184; 72; 198; 165; 203; 129; 190; 213; 64; 118; 101; 199; 44; 45; 35; 42; 180; 114}

// 🔓 WITHDRAWAL FORMATS:
// ======================
// Secret for withdraw_src: {51;243;202;48;254;166;228;125;169;176;152;77;72;23;73;79;3;32;82;124;168;65;173;26;192;23;51;109;248;147;118;48}
// Hashlock for withdraw_src: {34; 223; 55; 223; 136; 196; 16; 210; 197; 82; 136; 159; 116; 5; 184; 72; 198; 165; 203; 129; 190; 213; 64; 118; 101; 199; 44; 45; 35; 42; 180; 114}

// 📝 EXAMPLE WITHDRAW COMMAND:
// ============================
// dfx canister call icp_backend withdraw_src '(vec {51;243;202;48;254;166;228;125;169;176;152;77;72;23;73;79;3;32;82;124;168;65;173;26;192;23;51;109;248;147;118;48}, vec {34; 223; 55; 223; 136; 196; 16; 210; 197; 82; 136; 159; 116; 5; 184; 72; 198; 165; 203; 129; 190; 213; 64; 118; 101; 199; 44; 45; 35; 42; 180; 114})'
