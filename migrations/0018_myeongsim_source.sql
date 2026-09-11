-- Enable only after the deployed collector recognizes this name-filtered source.
INSERT OR IGNORE INTO collection_state(source) VALUES ('myeongsim_');
