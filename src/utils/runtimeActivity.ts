type RuntimeActivitySnapshot = Readonly<{
  activeStreams: number;
}>;

let activeStreams = 0;

function incrementActiveStreams(): void {
  activeStreams += 1;
}

function decrementActiveStreams(): void {
  activeStreams = Math.max(0, activeStreams - 1);
}

function getActivitySnapshot(): RuntimeActivitySnapshot {
  return Object.freeze({
    activeStreams,
  });
}

export {
  decrementActiveStreams,
  getActivitySnapshot,
  incrementActiveStreams,
};
