from sqlalchemy import Column, String, Text, Boolean, Integer, Numeric, ForeignKey, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from database import Base
import uuid


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(Text, nullable=False)
    role = Column(String, nullable=False, default="admin")
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)


class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(Text, nullable=False)
    status = Column(Text, nullable=False, default="Active")
    position_status = Column(Text, nullable=False, default="Open")

    details_basic = Column(JSONB, nullable=False, default=dict)
    details_role = Column(JSONB, nullable=False, default=dict)
    details_qualifications = Column(JSONB, nullable=False, default=dict)
    details_additional = Column(JSONB, nullable=False, default=dict)

    scoring_strategy = Column(Text, nullable=False, default="balanced")
    strong_threshold = Column(Integer, nullable=False, default=75)
    minimum_interview_threshold = Column(Integer, nullable=False, default=50)

    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)


class Batch(Base):
    __tablename__ = "batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)

    batch_code = Column(Text, nullable=False)
    total_files = Column(Integer, nullable=False, default=0)
    status = Column(Text, nullable=False, default="Completed")

    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("batches.id", ondelete="SET NULL"), nullable=True)

    name = Column(Text, nullable=False)
    score = Column(Numeric(5, 2), nullable=False, default=0)
    match_level = Column(Text, nullable=False, default="Low")
    recommendation_status = Column(Text, nullable=False, default="NO")
    is_recommended = Column(Boolean, nullable=False, default=False)
    stage = Column(Text, nullable=False, default="Screening")

    location = Column(Text)
    location_fit = Column(Text)
    experience_fit = Column(Text)
    role_capability_fit = Column(Text)
    education_fit = Column(Text)

    summary = Column(Text)
    recommendation_summary = Column(Text)
    about_candidate = Column(Text)
    match_issues = Column(Text)

    role_capability_score = Column(Integer)
    experience_relevance_score = Column(Integer)
    location_score = Column(Integer)

    location_explanation = Column(Text)
    experience_explanation = Column(Text)
    role_capability_explanation = Column(Text)
    education_explanation = Column(Text)

    resume_filename = Column(Text)
    resume_storage_url = Column(Text)

    interview_questions = Column(JSONB, nullable=False, default=list)
    score_breakdown = Column(JSONB, nullable=False, default=dict)
    component_scores = Column(JSONB, nullable=False, default=dict)

    is_new = Column(Boolean, nullable=False, default=False)

    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)