from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_db, get_registered_actor
from app.core.errors import ApiHTTPException
from app.schemas import (
    ReviewScoreFeedbackResponse, ScoreFeedbackPutRequest, ScoreFeedbackResponse,
    ScoreFeedbackWithdrawRequest,
)
from app.services.review_score_feedback import (
    get_owned_feedback, get_review_feedback, put_review_feedback, serialize_feedback, withdraw_feedback,
)

class PrivateFeedbackRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def private_handler(request: Request):
            try:
                response = await handler(request)
            except HTTPException as exc:
                exc.headers = {**(exc.headers or {}), 'Cache-Control': 'private, no-store'}
                raise
            except RequestValidationError as exc:
                raise ApiHTTPException(
                    status_code=422, code='VALIDATION_ERROR', message='Invalid score feedback request',
                    headers={'Cache-Control': 'private, no-store'},
                ) from exc
            response.headers['Cache-Control'] = 'private, no-store'
            return response

        return private_handler


router = APIRouter(tags=['score-feedback'], route_class=PrivateFeedbackRoute)


def get_score_feedback_actor(actor: CurrentActor = Depends(get_registered_actor)) -> CurrentActor:
    return actor


@router.get('/reviews/{review_id}/score-feedback', response_model=ReviewScoreFeedbackResponse)
def read_review_feedback(
    review_id: str,
    score_revision: str = Query(pattern=r'^[a-f0-9]{64}$'),
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_score_feedback_actor),
):
    response = get_review_feedback(db, actor, review_id, score_revision)
    db.commit()
    return response


@router.put('/reviews/{review_id}/score-feedback', response_model=ScoreFeedbackResponse)
def save_review_feedback(
    review_id: str,
    payload: ScoreFeedbackPutRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_score_feedback_actor),
):
    response = put_review_feedback(db, actor, review_id, payload)
    db.commit()
    return response


@router.get('/score-feedback/{feedback_id}', response_model=ScoreFeedbackResponse)
def read_feedback(
    feedback_id: str,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_score_feedback_actor),
):
    response = serialize_feedback(get_owned_feedback(db, actor, feedback_id))
    db.commit()
    return response


@router.delete('/score-feedback/{feedback_id}', response_model=ScoreFeedbackResponse)
def delete_feedback(
    feedback_id: str,
    payload: ScoreFeedbackWithdrawRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_score_feedback_actor),
):
    response = withdraw_feedback(db, actor, feedback_id, payload.expected_feedback_version)
    db.commit()
    return response
