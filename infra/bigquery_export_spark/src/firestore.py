from pyspark.sql import SparkSession
from google.cloud import firestore
from google.cloud import bigquery
import json
import os

class FirestoreBatch:
    def __init__(self):
        self.firestore = firestore.Client()
        self.bigquery = bigquery.Client()
        self.batch_size = 500
        self.max_concurrent_batches = 200
        self.current_batch = []
        self.batch_promises = []
        self.spark = SparkSession.builder.appName("FirestoreBatchProcessor").getOrCreate()

    def queue_batch(self, operation):
        batch = self.firestore.batch()

        for doc in self.current_batch:
            if operation == "delete":
                batch.delete(doc.reference)
            elif operation == "set":
                doc_ref = self.firestore.collection(self.collection_name).document()
                batch.set(doc_ref, doc)
            else:
                raise ValueError("Invalid operation")

        self.batch_promises.append(batch.commit())
        self.current_batch = []

    def commit_batches(self):
        print(f"Committing {len(self.batch_promises)} batches to {self.collection_name}")
        for batch_promise in self.batch_promises:
            try:
                batch_promise
            except Exception as e:
                print(f"Error committing batch: {e}")
                raise
        self.batch_promises = []

    def final_flush(self, operation):
        if self.current_batch:
            self.queue_batch(operation)
        if self.batch_promises:
            self.commit_batches()

    def batch_delete(self):
        print("Starting batch deletion...")
        start_time = self.spark.sparkContext.startTime
        self.current_batch = []
        self.batch_promises = []
        total_docs_deleted = 0

        collection_ref = self.firestore.collection(self.collection_name)
        if self.collection_type == "report":
            print(f"Deleting documents from {self.collection_name} for date {self.date}")
            query = collection_ref.where("date", "==", self.date)
        elif self.collection_type == "dict":
            print(f"Deleting documents from {self.collection_name}")
            query = collection_ref
        else:
            raise ValueError("Invalid collection type")

        while True:
            docs = list(query.limit(self.batch_size * self.max_concurrent_batches).stream())
            if not docs:
                break

            for doc in docs:
                self.current_batch.append(doc)
                if len(self.current_batch) >= self.batch_size:
                    self.queue_batch("delete")
                if len(self.batch_promises) >= self.max_concurrent_batches:
                    self.commit_batches()
                total_docs_deleted += 1

        self.final_flush("delete")
        duration = (self.spark.sparkContext.startTime - start_time) / 1000
        print(f"Deletion complete. Total docs deleted: {total_docs_deleted}. Time: {duration} seconds")

    def stream_from_bigquery(self, query):
        print("Starting BigQuery to Firestore transfer...")
        start_time = self.spark.sparkContext.startTime
        total_rows_processed = 0

        df = self.spark.read.format("bigquery").option("query", query).load()

        for row in df.collect():
            self.current_batch.append(row.asDict())
            if len(self.current_batch) >= self.batch_size:
                self.queue_batch("set")
            if len(self.batch_promises) >= self.max_concurrent_batches:
                self.commit_batches()
            total_rows_processed += 1

        self.final_flush("set")
        duration = (self.spark.sparkContext.startTime - start_time) / 1000
        print(f"Transfer to {self.collection_name} complete. Total rows processed: {total_rows_processed}. Time: {duration} seconds")

    def export(self):
        export_config = json.loads('{"name": "technologies", "type": "dict", "environment": "dev"}')
        query = str(json.loads("SELECT * FROM report.tech_report_technologies"))

        self.date = getattr(export_config, "date", "")
        self.collection_name = export_config["name"]
        self.collection_type = export_config["type"]

        self.batch_delete()
        self.stream_from_bigquery(query)

if __name__ == "__main__":
    processor = FirestoreBatch()
    processor.export()
