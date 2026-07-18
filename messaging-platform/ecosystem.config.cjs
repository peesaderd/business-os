module.exports = {
  apps: [
    {
      name: "msg-core",
      cwd: ".",
      script: "uvicorn",
      args: "core.server:app --host 127.0.0.1 --port 8300",
      interpreter: "python3",
      env: {
        PYTHONPATH: ".",
        DB_PATH: "data/messaging.db",
        ERP_MCP_PATH: "/home/openhands/erp-core/build/index.js",
      },
    },
    {
      name: "line-adapter",
      cwd: ".",
      script: "uvicorn",
      args: "adapters.line_adapter:app --host 127.0.0.1 --port 8310",
      interpreter: "python3",
      env: {
        PYTHONPATH: ".",
        LINE_CHANNEL_ACCESS_TOKEN: "ziMu03o16gCvZHOlda5ZvY4dwjEl9e5A+vHerNtdcBNOxHkrptywus7b9pa8fPNfCH+XUX7ABmHaC9PRTvVY/ryfMvEx1sGVypMVV6Csn1AP1gPe1vbpfFWvKYeQbVJC1FBhmtrZeiX/p72sqgmwHAdB04t89/1O/w1cDnyilFU=",
        LINE_CHANNEL_SECRET: "37ef62a24e30db382e195c3faeaf0a96",
      },
    },
    {
      name: "tg-adapter",
      cwd: ".",
      script: "uvicorn",
      args: "adapters.tg_adapter:app --host 127.0.0.1 --port 8320",
      interpreter: "python3",
      env: {
        PYTHONPATH: ".",
        TG_BOT_TOKEN: "",
      },
    },
    {
      name: "wa-adapter",
      cwd: ".",
      script: "uvicorn",
      args: "adapters.wa_adapter:app --host 127.0.0.1 --port 8330",
      interpreter: "python3",
      env: {
        PYTHONPATH: ".",
        WA_API_TOKEN: "",
        WA_PHONE_NUMBER_ID: "",
      },
    },
  ],
};
