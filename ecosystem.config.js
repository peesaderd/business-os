module.exports = {
  apps: [
    { name: 'bos-gateway',     script: './gateway/server.js',      env: { PORT: 8088 } },
    { name: 'bos-ai-chat',     script: './services/ai-chat/server.js', env: { PORT: 8108 } },
    { name: 'bos-image-gen',   script: './services/image-gen/server.js', env: { PORT: 8110 } },
    { name: 'bos-social-post', script: './services/social-post/server.js', env: { PORT: 8112 } },
    { name: 'bos-queue',       script: './services/queue/server.js',   env: { PORT: 8113 } },
    { name: 'bos-pos',         script: './services/pos/server.js',     env: { PORT: 8114 } },
    { name: 'bos-booking',     script: './services/booking/server.js', env: { PORT: 8115 } },
    { name: 'bos-video-gen',   script: './services/video-gen/server.js', env: { PORT: 8116 } },
    { name: 'bos-website',     script: './services/website-builder/server.js', env: { PORT: 8120 } },
    { name: 'bos-wordpress',   script: './services/wordpress/server.js',   env: { PORT: 8109 } },
    { name: 'bos-payment',    script: './services/payment/src/index.js', env: { PORT: 8122 } },
  ]
};
