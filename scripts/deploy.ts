import { BigNumber, providers, Wallet, Contract } from "ethers";
import { deployContract } from "ethereum-waffle";
import StakingRewards from "../build/StakingRewards.json";
import Config from "../deploy.json";
import IOxDexPairJson from "../build/IOxDexPair.json";
import { IOxDexPair } from "../types";
import { createInterface } from "readline";

const deployComfirm = (chainId: number, pair: [string, string] | [string]) => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((res, rej) => {
    const q = `Please confirm: staking by ${
      pair.length == 2 ? `Pair ${pair[0]}/${pair[1]}` : "OX-Based"
    } on network ${chainId} (Y/n)`;
    rl.question(q, (answer) => {
      try {
        if (answer === "Y") {
          res(null);
        } else {
          rej("rejected");
        }
      } finally {
        rl.close();
      }
    });
  });
};

async function main() {
  const provider = new providers.JsonRpcProvider(Config.enpoint);
  const signer = Wallet.fromMnemonic(Config.mnemonic).connect(provider);
  const { chainId } = await provider.getNetwork();

  console.log("checking deployer balance...");
  if ((await signer.getBalance()).lt(BigNumber.from("200000000000000000"))) {
    throw new Error("insufficient funds for deploying");
  }

  console.log("checking OX token info...");
  const OX = new Contract(
    "0xfbb70f04b1a209160fe1a155dda35a569d1ec93b",
    IOxDexPairJson.abi,
    provider
  ) as IOxDexPair; // ERC20-only
  const [OXNMAE, OXSYMBOL, OXDECIMAL] = await Promise.all([
    OX.name(),
    OX.symbol(),
    OX.decimals(),
  ]);
  if (OXNMAE != "OX" || OXSYMBOL != "OX" || OXDECIMAL != 18) {
    throw "wrong OX Token address";
  }

  if (Config.stakingToken == OX.address) {
    await deployComfirm(chainId, [OX.address]);
  } else {
    console.log("checking pair info...");
    const PAIR = new Contract(
      Config.stakingToken,
      IOxDexPairJson.abi,
      provider
    ) as IOxDexPair;
    if ((await PAIR.symbol()) === "OXLP") {
      const [token0Addr, token1Addr] = await Promise.all([
        PAIR.token0(),
        PAIR.token1(),
      ]);
      const token0 = new Contract(
        token0Addr,
        IOxDexPairJson.abi,
        provider
      ) as IOxDexPair;
      const token1 = new Contract(
        token1Addr,
        IOxDexPairJson.abi,
        provider
      ) as IOxDexPair;
      const [token0Symbol, token1Symbol] = await Promise.all([
        token0.symbol(),
        token1.symbol(),
      ]);
      await deployComfirm(chainId, [token0Symbol, token1Symbol]);
    } else {
      throw new Error("Staking should be LP token");
    }
  }

  console.log("deploying...");
  const deploying = await deployContract(signer, StakingRewards, [
    signer.address,
    signer.address,
    OX.address,
    Config.stakingToken,
  ]);
  console.log("deployed at", deploying.address);
}

main().catch(console.log);
