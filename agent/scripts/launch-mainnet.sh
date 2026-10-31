#!/bin/bash
# Mainnet launch of the Avow league on HSK Chain (chain 177), run on the VM from ~/dictum. Every step is skipped when already done,
# so the script can be re-run after a failure. Spends only what the setup key holds; see MAINNET.md for the budget.
#   bash launch-mainnet.sh check      # balances and the plan, no transactions
#   bash launch-mainnet.sh go         # deploy, enter the league, fund, start the agents
set -euo pipefail
cd ~/dictum
M=~/dictum/mainnet
export DICTUM_MODE=mainnet DICTUM_RPC=https://mainnet.hsk.xyz
SETUP=$M/.keys/setup.key
# per vault: persona, agent key, data dir, port, agent gas (HSK)
AGENTS=("avow $M/.keys/agent.key $M/data 8788 2" "bold $M/.keys/agent-bold.key $M/league/bold/data 8791 5" "fade $M/.keys/agent-fade.key $M/league/fade/data 8792 5")
# a small mandate: $5 cap, so Probation notes are $1; $5 open exposure; $2 daily loss
export DICTUM_MAX_NOTIONAL=5000000 DICTUM_MAX_EXPOSURE=5000000 DICTUM_DAILY_LOSS=2000000
# per vault: $3 USDT and about $1.20 each of WETH, WBTC and WHSK (short notes sell inventory)
FUND="DICTUM_FUND_USDT=3 DICTUM_FUND_ETH_USD=1.2 DICTUM_FUND_BTC_USD=1.2 DICTUM_FUND_HSK_USD=1.2 DICTUM_KEEP_GAS_HSK=1"

bal() { curl -s -X POST -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBalance\",\"params\":[\"$1\",\"latest\"]}" https://mainnet.hsk.xyz | python3 -c "import sys,json;print(round(int(json.load(sys.stdin)['result'],16)/1e18,3))"; }
SETUP_ADDR=$(node bin/addr.js $SETUP)

if [ "${1:-check}" = "check" ]; then
  echo "setup $SETUP_ADDR holds $(bal $SETUP_ADDR) HSK (need about 290)"
  for a in "${AGENTS[@]}"; do set -- $a; echo "$1: agent $(node bin/addr.js $2), data $3, port $4, gas $5 HSK, deployed: $([ -f $3/deploy.json ] && grep -o '"vault": "[^"]*"' $3/deploy.json || echo no)"; done
  exit 0
fi

for a in "${AGENTS[@]}"; do
  set -- $a
  mkdir -p $3
  cp -n $M/data/study.json $M/data/replay.json $3/ 2>/dev/null || true
  if [ ! -f $3/deploy.json ]; then
    echo "== deploy $1"
    DICTUM_DEPLOYER_KEY_FILE=$SETUP DICTUM_AGENT_KEY_FILE=$2 DICTUM_DATA_DIR=$3 node bin/deploy.js
  fi
done

V() { grep '"vault"' $1/deploy.json | cut -d'"' -f4; }
B() { grep '"block"' $1/deploy.json | tr -dc 0-9; }

if [ ! -f $M/league.json ]; then
  echo "== league registry"
  OUT=$(DICTUM_OWNER_KEY_FILE=$SETUP node bin/league-setup.js $(V $M/data):Avow $(V $M/league/bold/data):Bold $(V $M/league/fade/data):Fade)
  echo "$OUT"
  echo "{\"registry\": \"$(echo "$OUT" | grep DICTUM_LEAGUE_REGISTRY= | cut -d= -f2)\"}" > $M/league.json
fi
REG=$(grep -o '0x[0-9a-fA-F]*' $M/league.json)

if [ ! -f $M/erc8004.json ]; then
  echo "== ERC-8004 registries, agents and grader"
  OUT=$(DICTUM_OWNER_KEY_FILE=$SETUP node bin/erc8004-setup.js $(V $M/data):Avow:avow $(V $M/league/bold/data):Bold:bold $(V $M/league/fade/data):Fade:fade)
  echo "$OUT"
  echo "{\"grader\": \"$(echo "$OUT" | grep DICTUM_ERC8004_GRADER= | cut -d= -f2)\"}" > $M/erc8004.json
fi
GRADER=$(grep -o '0x[0-9a-fA-F]*' $M/erc8004.json)

for a in "${AGENTS[@]}"; do
  set -- $a
  if [ ! -f $3/funded ]; then
    echo "== fund $1"
    env $FUND DICTUM_AGENT_GAS_HSK=$5 DICTUM_SETUP_KEY_FILE=$SETUP DICTUM_AGENT_ADDRESS=$(node bin/addr.js $2) DICTUM_VAULT=$(V $3) node bin/fund.js && touch $3/funded
  fi
done

for a in "${AGENTS[@]}"; do
  set -- $a
  NAME=avow-mainnet; [ $1 = avow ] || NAME=avow-mainnet-$1
  EXTRA=""
  [ $1 = avow ] && EXTRA="Environment=DICTUM_LEAGUE=http://127.0.0.1:8791,http://127.0.0.1:8792"
  START="/usr/bin/node --max-old-space-size=160 /home/rohan/dictum/bin/index.js"
  [ $1 = avow ] && START="/bin/bash -c 'DICTUM_DESK_SECRET=\$(cat $M/.keys/desk-secret) exec /usr/bin/node /home/rohan/dictum/bin/index.js'"
  sudo tee /etc/systemd/system/$NAME.service >/dev/null <<UNIT
[Unit]
Description=Avow league agent $1 (HSK Chain mainnet)
After=network-online.target
[Service]
User=rohan
WorkingDirectory=$M
Environment=DICTUM_MODE=mainnet
Environment=DICTUM_RPC=https://mainnet.hsk.xyz
Environment=DICTUM_VAULT=$(V $3)
Environment=DICTUM_DEPLOY_BLOCK=$(B $3)
Environment=DICTUM_AGENT_KEY_FILE=$2
Environment=DICTUM_DATA_DIR=$3
Environment=DICTUM_PERSONA=$1
Environment=DICTUM_LEAGUE_REGISTRY=$REG
Environment=DICTUM_ERC8004_GRADER=$GRADER
Environment=PORT=$4
$EXTRA
ExecStart=$START
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
UNIT
done
sudo systemctl daemon-reload
sudo systemctl enable --now avow-mainnet avow-mainnet-bold avow-mainnet-fade
sleep 30
systemctl is-active avow-mainnet avow-mainnet-bold avow-mainnet-fade
curl -s localhost:8788/league | head -c 600; echo
echo "setup key left: $(bal $SETUP_ADDR) HSK"
