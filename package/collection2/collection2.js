import { EventEmitter } from 'meteor/raix:eventemitter';

// Exported only for listening to events
const Collection2 = new EventEmitter();

Collection2.load = function () {
  import './load';
};

export default Collection2;
