
const { AuthManager } = require('./src/main/core/auth/AuthManager');
const { PluginLoader } = require('./src/main/core/plugins/PluginLoader');

async function debugSort() {
  const authManager = new AuthManager();
  const pluginLoader = new PluginLoader(authManager);
  pluginLoader.loadInternalPlugins();

  const providers = pluginLoader.getAllProviders();
  console.log('--- DEBUG LIKED SONGS SORTING ---');

  const results = await Promise.allSettled(
    providers.map(async (p) => {
      if (p.getLikedTracks) {
        const tracks = await p.getLikedTracks();
        return tracks;
      }
      return [];
    })
  );

  const allTracks = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
    .flat();

  console.log(`Total tracks fetched: ${allTracks.length}`);

  // Sort as in main.ts
  allTracks.sort((a, b) => (b.likedAt || 0) - (a.likedAt || 0));

  console.log('\n--- TOP 20 SORTED TRACKS ---');
  allTracks.slice(0, 20).forEach((t, i) => {
    console.log(`${i+1}. [${t.provider}] ${t.title} - ${t.artist} | likedAt: ${t.likedAt} (${new Date(t.likedAt).toLocaleString()})`);
  });

  const providersInTop20 = [...new Set(allTracks.slice(0, 20).map(t => t.provider))];
  console.log('\nProviders in top 20:', providersInTop20);
}

debugSort().catch(console.error);
