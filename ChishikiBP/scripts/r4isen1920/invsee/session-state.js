export function hasSnapshotChanged(previousValue, nextValue) {
 return previousValue !== nextValue;
}

export function isSessionParticipantMissing(targetIsPlayer, viewerIsPlayer) {
 return !targetIsPlayer || !viewerIsPlayer;
}
