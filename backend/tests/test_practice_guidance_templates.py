from copy import deepcopy
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.practice_guidance import TEMPLATES, _template_response, guidance_templates


def test_owner_confirmation_covers_the_eight_visible_chinese_summaries():
    templates = guidance_templates('zh')
    assert len(templates) == 8
    assert all(item.human_review_status == 'owner_confirmed_summary' for item in templates)
    assert all(item.success_criteria and item.transfer_task for item in templates)


def test_unreviewed_translations_do_not_inherit_chinese_confirmation():
    for locale in ('en', 'ja'):
        assert all(item.human_review_status == 'draft_pending_review' for item in guidance_templates(locale))


def test_changed_or_new_summaries_require_a_new_confirmation():
    changes = [
        lambda item: item['title'].update(zh='更改后的标题'),
        lambda item: item['goal_example'].update(zh='更改后的目标。'),
        lambda item: item.update(dimension='lighting'),
        lambda item: item.update(template_id='new-template'),
    ]
    for change in changes:
        edited = deepcopy(TEMPLATES[0])
        change(edited)
        assert _template_response(edited, 'zh').human_review_status == 'draft_pending_review'
