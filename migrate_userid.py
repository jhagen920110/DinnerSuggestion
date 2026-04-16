"""
Migrate Cosmos DB documents from userId "jonathan" to "jonathanh".

For each container, finds all docs with userId="jonathan",
creates a copy with userId="jonathanh", then deletes the old doc.
(Cosmos requires delete+recreate to change partition key.)
"""

from azure.cosmos import CosmosClient, PartitionKey, exceptions
import json

import os

ENDPOINT = os.environ.get("COSMOS_ENDPOINT", "https://cosmos-dinnersuggestion-dev.documents.azure.com:443/")
KEY = os.environ["COSMOS_KEY"]  # Set COSMOS_KEY env var before running
DATABASE = "DinnerSuggestionDb"

OLD_USER = "jonathan"
NEW_USER = "jonathanh"

CONTAINERS = ["ingredients", "recipes", "meal-logs", "tags"]

client = CosmosClient(ENDPOINT, KEY)
db = client.get_database_client(DATABASE)

total_migrated = 0
total_skipped = 0

for container_name in CONTAINERS:
    container = db.get_container_client(container_name)
    print(f"\n--- {container_name} ---")

    # Find all docs with old userId
    query = f"SELECT * FROM c WHERE c.userId = '{OLD_USER}'"
    old_docs = list(container.query_items(query, partition_key=OLD_USER))
    print(f"  Found {len(old_docs)} docs with userId='{OLD_USER}'")

    if not old_docs:
        continue

    for doc in old_docs:
        doc_id = doc["id"]
        doc_name = doc.get("name", doc.get("date", doc_id))

        # Check if same id already exists under new userId
        try:
            existing = container.read_item(doc_id, partition_key=NEW_USER)
            print(f"  SKIP '{doc_name}' — already exists under '{NEW_USER}'")
            total_skipped += 1
            continue
        except exceptions.CosmosResourceNotFoundError:
            pass

        # Create new doc with updated userId
        new_doc = dict(doc)
        new_doc["userId"] = NEW_USER
        # Remove Cosmos metadata fields
        for key in ["_rid", "_self", "_etag", "_attachments", "_ts"]:
            new_doc.pop(key, None)

        container.create_item(new_doc)

        # Delete old doc
        container.delete_item(doc_id, partition_key=OLD_USER)

        print(f"  Migrated '{doc_name}'")
        total_migrated += 1

print(f"\nDone! Migrated: {total_migrated}, Skipped: {total_skipped}")
