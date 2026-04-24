from database import SessionLocal
from models import User
from auth import get_password_hash

def seed_admin():
    db = SessionLocal()

    try:
        existing_user = db.query(User).filter(User.username == "admin").first()
        print("Existing user found:", existing_user)

        if existing_user:
            print("Admin user already exists.")
            return

        admin_user = User(
            username="admin",
            email="admin@example.com",
            hashed_password=get_password_hash("Admin@123"),
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