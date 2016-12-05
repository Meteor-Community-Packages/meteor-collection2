/* books */



// Add one unique index outside of C2
if (Meteor.isServer) {
  try {
    books._dropIndex({field1: 1, field2: 1});
  } catch (err) {

  }
  books._ensureIndex({field1: 1, field2: 1}, {unique: true, sparse: true});
}
