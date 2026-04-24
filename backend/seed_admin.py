import os

from dotenv import load_dotenv

from database import SessionLocal
from models import User
from auth import get_password_hash

load_dotenv()

DEFAULT_ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
DEFAULT_ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@123")

def seed_admin():
    db = SessionLocal()

    try:
        existing_user = db.query(User).filter(User.username == DEFAULT_ADMIN_USERNAME).first()
        print("Existing user found:", existing_user)

        if existing_user:
            print("Admin user already exists.")
            return

        admin_user = User(
            username=DEFAULT_ADMIN_USERNAME,
            email=DEFAULT_ADMIN_EMAIL,
            hashed_password=get_password_hash(DEFAULT_ADMIN_PASSWORD),
            role="admin",
            is_active=True
        )

        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

        print("Admin user created successfully.")
        print("Created ID:", admin_user.id)

    finally:
        db.close()


if __name__ == "__main__":
    seed_admin()
