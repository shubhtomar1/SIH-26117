"""Retriever interface + keyword/TF-IDF retriever (no embeddings, no servers).

Future: FAISSRetriever / QdrantRetriever implement BaseRetriever — no logic changes.
"""
import math
import re
from collections import Counter

from sqlalchemy.orm import Session

from app.models.document import Document

_WORD = re.compile(r"[a-z0-9]+")

_STOPWORDS = {
    "a", "an", "the", "in", "on", "at", "to", "for", "of", "with", "by", "is", "are", "was",
    "were", "it", "this", "that", "and", "or", "as", "be", "from", "into", "all", "any",
    "can", "could", "should", "would", "do", "does", "did", "have", "has", "had", "how",
    "what", "when", "where", "who", "which", "why", "me", "my", "we", "our", "you", "your",
    "tell", "write", "create", "make", "generate", "give", "show", "please", "using", "about",
}


def tokenize(text: str) -> list[str]:
    return _WORD.findall((text or "").lower())


class BaseRetriever:
    def search(self, query: str, filters: dict | None = None, top_k: int = 3) -> list[dict]:
        raise NotImplementedError


class KeywordRetriever(BaseRetriever):
    def __init__(self, db: Session):
        self.db = db

    def search(self, query: str, filters: dict | None = None, top_k: int = 3) -> list[dict]:
        filters = filters or {}
        q = self.db.query(Document)
        if filters.get("department"):
            q = q.filter(Document.department == filters["department"])
        if filters.get("document_ids"):
            q = q.filter(Document.id.in_(filters["document_ids"]))
        else:
            q = q.filter(Document.category.in_(["sop", "knowledge", "policy", "standard"]))
        docs = q.all()
        if not docs:
            return []
        raw_terms = tokenize(query)
        q_terms = [t for t in raw_terms if t not in _STOPWORDS]
        if not q_terms:
            q_terms = raw_terms
        if not q_terms:
            return []
        # TF-IDF over the local corpus
        doc_terms = [tokenize(d.content) for d in docs]
        df = Counter()
        for terms in doc_terms:
            for t in set(terms):
                df[t] += 1
        n = len(docs)
        scored = []
        for doc, terms in zip(docs, doc_terms):
            if not terms:
                continue
            tf = Counter(terms)
            score = 0.0
            for t in q_terms:
                if t in tf:
                    idf = math.log((n + 1) / (df[t] + 1)) + 1.0
                    score += (tf[t] / len(terms)) * idf
            if score >= 0.15:
                words = (doc.content or "").split()
                excerpt = " ".join(words[:80])
                joined = " ".join(words).lower()
                for term in q_terms:
                    idx = joined.find(term)
                    if idx >= 0:
                        start = max(0, idx - 80)
                        excerpt = (doc.content or "")[start:start + 400]
                        break
                scored.append({"document": doc, "score": round(score, 4), "excerpt": excerpt})
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]


class RAGService:
    """Business logic talks to RAGService, never to a concrete retriever."""

    def __init__(self, db: Session, retriever: BaseRetriever | None = None):
        self.db = db
        self.retriever = retriever or KeywordRetriever(db)

    def search(self, query: str, department: str | None = None, top_k: int = 3) -> list[dict]:
        return self.retriever.search(query, filters={"department": department} if department else None, top_k=top_k)

    def search_documents(self, query: str, document_ids: list[str], top_k: int = 5) -> list[dict]:
        return self.retriever.search(query, filters={"document_ids": document_ids}, top_k=top_k)

