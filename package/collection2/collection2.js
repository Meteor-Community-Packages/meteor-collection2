import { EventEmitter } from 'meteor/raix:eventemitter';
import { autoValue as registerAutoValue } from './zodAutoValue';

// Exported only for listening to events
Collection2 = new EventEmitter();
autoValue = registerAutoValue;

Collection2.autoValue = autoValue;

export default Collection2;
export { autoValue };
