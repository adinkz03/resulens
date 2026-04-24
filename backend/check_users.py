from database import SessionLocal
from models import User

db = SessionLocal()

try:
    users = db.query(User).all()
    print(f"Total users: {len(users)}")

    for user in users:
        print({
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active
        })
finally:
    db.close()