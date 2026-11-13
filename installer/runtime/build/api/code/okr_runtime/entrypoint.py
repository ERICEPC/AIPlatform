"""Native Flask integration; migration and resource provisioning remain explicit."""
from app import app
from .store import Store
from .auth import Authenticator
from .native_checks import membership_check
from .native_binding import Resolver
from .native_executor import native_engine
from .pb_contract import load_contract
from .contracts import KINDS
from .api import blueprint
with app.app_context():
 store=Store(native_engine())
 auth=Authenticator(store.engine,membership_check)
 contract=load_contract()
 app.register_blueprint(blueprint(store,auth,{('pb.okr.v1',kind):contract for kind in KINDS},Resolver(store.engine)))
 # Independent recommendation input/output; never relax the formal plan adapter.
 from . import recommendation_contract as recommendation
 recommendation_auth=Authenticator(store.engine,membership_check,token_prefix='rx_rec_')
 recommendation_schema=recommendation.load_contract()
 app.register_blueprint(blueprint(store,recommendation_auth,
  {(recommendation.VERSION,recommendation.KIND):recommendation_schema},Resolver(store.engine),
  adapter=recommendation,schema_version=recommendation.VERSION,name='raccoon_recommendation_runtime',
  url_prefix='/v1/recommendations/applications'))
