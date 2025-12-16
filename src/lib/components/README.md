(async () => {
  // If this import fails, try: '/src/lib/stores/simulation'
  const { simulation } = await import('/src/lib/stores/simulation.ts');

  let controller;
  const unsub = simulation.subscribe((c) => {
    controller = c;
  });
  unsub(); // unsubscribe immediately; we only wanted the current value

  console.log('controller =', controller);
  console.log('topology.nodes (Map) =', controller.topology.nodes);
  console.log('node ids =', [...controller.topology.nodes.keys()]);
  console.table(
    [...controller.topology.nodes.values()].map((n) => ({
      id: n.id,
      name: n.name,
      xPos: n.xPos,
      yPos: n.yPos,
      type: n?.constructor?.name ?? 'unknown',
    }))
  );
})();


## Debbuging code to actaull print out if new router are printed
