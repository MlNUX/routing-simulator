/**
 * Enthält alle Ereignistypen, die im Simulationsverlauf gespeichert
 * und für History, Import/Export sowie Konfliktprüfung verwendet werden.
 */
export enum EventType {
	NODE_FAILURE = 'NODE_FAILURE',
	LINK_FAILURE = 'LINK_FAILURE',
	NODE_ADDITION = 'NODE_ADDITION',
	LINK_ADDITION = 'LINK_ADDITION',
	WEIGHT_CHANGE = 'WEIGHT_CHANGE',
	NODE_MOVE = 'NODE_MOVE',
	NODE_RENAME = 'NODE_RENAME',
	NODE_DISABLE = 'NODE_DISABLE',
	NODE_ENABLE = 'NODE_ENABLE'
}
